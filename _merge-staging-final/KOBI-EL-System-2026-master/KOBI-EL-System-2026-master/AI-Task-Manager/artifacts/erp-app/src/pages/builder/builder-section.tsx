import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, Link } from "wouter";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Database, TextCursorInput, Link2, FormInput, Table2, CreditCard,
  FolderTree, CircleDot, MousePointerClick, Zap, Shield, MenuSquare,
  BarChart3, LayoutGrid, GitBranch, Bot, Copy, Upload, Hash,
  ExternalLink, Search, Plus, Edit2, Trash2, X, ChevronDown,
  Filter, Eye, ArrowUpDown, LayoutList, Grid3x3, ChevronRight,
  Settings, AlertCircle, CheckCircle, Package, Layers,
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { FIELD_TYPES, FIELD_TYPE_MAP, ENTITY_TYPES, STATUS_COLORS } from "./field-type-registry";
import { LoadingSkeleton, EmptyState } from "@/components/ui/unified-states";

const API = "/api";

interface SectionConfig {
  title: string;
  titleEn: string;
  icon: any;
  description: string;
  readEndpoint: string;
  createEndpoint?: string;
  duplicateBasePath?: string;
  parentType?: "module" | "entity";
  color: string;
  gradientFrom: string;
  gradientTo: string;
  columns: { key: string; label: string; type?: "badge" | "color" | "boolean" | "link" | "entity" | "module" | "fieldType" | "date" }[];
  getDetailLink?: (item: any) => string;
  createFields?: CreateFieldDef[];
  showEntityGroup?: boolean;
}

interface CreateFieldDef {
  key: string;
  label: string;
  type: "text" | "select" | "checkbox" | "color" | "number";
  required?: boolean;
  options?: { value: string; label: string }[];
  autoSlug?: boolean;
  placeholder?: string;
  defaultValue?: any;
}

const SECTION_CONFIG: Record<string, SectionConfig> = {
  entities: {
    title: "ישויות",
    titleEn: "Entities",
    icon: Database,
    description: "כל הישויות במערכת — אובייקטים עסקיים שנבנו דרך הפלטפורמה",
    readEndpoint: "/claude/system/entities",
    createEndpoint: "/platform/modules/{parentId}/entities",
    parentType: "module",
    color: "blue",
    gradientFrom: "from-blue-500",
    gradientTo: "to-cyan-500",
    columns: [
      { key: "name", label: "שם", type: "link" },
      { key: "slug", label: "Slug" },
      { key: "entityType", label: "סוג", type: "badge" },
      { key: "fieldCount", label: "שדות" },
      { key: "moduleId", label: "מודול", type: "module" },
    ],
    getDetailLink: (item: any) => `/builder/entity/${item.id}`,
    createFields: [
      { key: "name", label: "שם הישות", type: "text", required: true, placeholder: "לדוגמה: הזמנה, חשבונית, מוצר" },
      { key: "namePlural", label: "שם ברבים", type: "text", required: true, placeholder: "לדוגמה: הזמנות, חשבוניות, מוצרים" },
      { key: "slug", label: "Slug", type: "text", required: true, autoSlug: true },
      { key: "entityType", label: "סוג ישות", type: "select", required: true, options: ENTITY_TYPES.map(t => ({ value: t.key, label: t.label })), defaultValue: "master" },
      { key: "description", label: "תיאור", type: "text", placeholder: "תיאור קצר של הישות" },
    ],
  },
  fields: {
    title: "שדות",
    titleEn: "Fields",
    icon: TextCursorInput,
    description: "כל השדות הדינמיים שהוגדרו לישויות במערכת",
    readEndpoint: "/claude/system/fields",
    createEndpoint: "/platform/entities/{parentId}/fields",
    parentType: "entity",
    color: "violet",
    gradientFrom: "from-violet-500",
    gradientTo: "to-purple-500",
    showEntityGroup: true,
    columns: [
      { key: "name", label: "שם" },
      { key: "fieldType", label: "סוג שדה", type: "fieldType" },
      { key: "isRequired", label: "חובה", type: "boolean" },
      { key: "isSearchable", label: "חיפוש", type: "boolean" },
      { key: "entityId", label: "ישות", type: "entity" },
    ],
    createFields: [
      { key: "name", label: "שם השדה", type: "text", required: true, placeholder: "לדוגמה: שם לקוח, מספר הזמנה" },
      { key: "slug", label: "Slug", type: "text", required: true, autoSlug: true },
      { key: "fieldKey", label: "Field Key", type: "text", required: true, autoSlug: true },
      { key: "fieldType", label: "סוג שדה", type: "select", required: true, options: FIELD_TYPES.map(ft => ({ value: ft.key, label: `${ft.label} (${ft.key})` })), defaultValue: "text" },
      { key: "isRequired", label: "שדה חובה", type: "checkbox", defaultValue: false },
      { key: "isSearchable", label: "ניתן לחיפוש", type: "checkbox", defaultValue: true },
    ],
  },
  relations: {
    title: "קשרים",
    titleEn: "Relations",
    icon: Link2,
    description: "קשרים בין ישויות — one-to-many, many-to-many",
    readEndpoint: "/claude/system/relations",
    color: "amber",
    gradientFrom: "from-amber-500",
    gradientTo: "to-orange-500",
    columns: [
      { key: "name", label: "שם" },
      { key: "relationType", label: "סוג קשר", type: "badge" },
      { key: "sourceEntityId", label: "ישות מקור", type: "entity" },
      { key: "targetEntityId", label: "ישות יעד", type: "entity" },
    ],
  },
  forms: {
    title: "טפסים",
    titleEn: "Forms",
    icon: FormInput,
    description: "הגדרות טפסים דינמיים — סקשנים, סדר שדות, layout",
    readEndpoint: "/claude/system/forms",
    createEndpoint: "/platform/entities/{parentId}/forms",
    duplicateBasePath: "/platform/forms",
    parentType: "entity",
    color: "green",
    gradientFrom: "from-green-500",
    gradientTo: "to-emerald-500",
    showEntityGroup: true,
    columns: [
      { key: "name", label: "שם" },
      { key: "slug", label: "Slug" },
      { key: "formType", label: "סוג", type: "badge" },
      { key: "isDefault", label: "ברירת מחדל", type: "boolean" },
      { key: "entityId", label: "ישות", type: "entity" },
    ],
    createFields: [
      { key: "name", label: "שם הטופס", type: "text", required: true, placeholder: "לדוגמה: טופס יצירה, טופס עריכה" },
      { key: "slug", label: "Slug", type: "text", required: true, autoSlug: true },
      { key: "formType", label: "סוג טופס", type: "select", options: [
        { value: "create", label: "יצירה" }, { value: "edit", label: "עריכה" },
        { value: "wizard", label: "אשף" }, { value: "quick_create", label: "מהיר" },
      ], defaultValue: "create" },
      { key: "isDefault", label: "ברירת מחדל", type: "checkbox", defaultValue: false },
    ],
  },
  views: {
    title: "תצוגות",
    titleEn: "Views",
    icon: Table2,
    description: "תצוגות רשימה — עמודות, פילטרים, מיון, קיבוץ",
    readEndpoint: "/claude/system/views",
    createEndpoint: "/platform/entities/{parentId}/views",
    duplicateBasePath: "/platform/views",
    parentType: "entity",
    color: "teal",
    gradientFrom: "from-teal-500",
    gradientTo: "to-cyan-500",
    showEntityGroup: true,
    columns: [
      { key: "name", label: "שם" },
      { key: "slug", label: "Slug" },
      { key: "viewType", label: "סוג", type: "badge" },
      { key: "isDefault", label: "ברירת מחדל", type: "boolean" },
      { key: "entityId", label: "ישות", type: "entity" },
    ],
    createFields: [
      { key: "name", label: "שם התצוגה", type: "text", required: true, placeholder: "לדוגמה: תצוגת טבלה, תצוגת כרטיסים" },
      { key: "slug", label: "Slug", type: "text", required: true, autoSlug: true },
      { key: "viewType", label: "סוג תצוגה", type: "select", options: [
        { value: "table", label: "טבלה" }, { value: "kanban", label: "קנבאן" },
        { value: "calendar", label: "לוח שנה" }, { value: "cards", label: "כרטיסים" },
        { value: "timeline", label: "ציר זמן" }, { value: "gallery", label: "גלריה" },
      ], defaultValue: "table" },
      { key: "isDefault", label: "ברירת מחדל", type: "checkbox", defaultValue: false },
    ],
  },
  details: {
    title: "כרטיסי ישות",
    titleEn: "Detail Pages",
    icon: CreditCard,
    description: "תצוגות כרטיס פרטי — בלוקים, נתונים קשורים, פעולות",
    readEndpoint: "/claude/system/detail-pages",
    createEndpoint: "/platform/entities/{parentId}/details",
    duplicateBasePath: "/platform/details",
    parentType: "entity",
    color: "pink",
    gradientFrom: "from-pink-500",
    gradientTo: "to-rose-500",
    columns: [
      { key: "name", label: "שם" },
      { key: "slug", label: "Slug" },
      { key: "isDefault", label: "ברירת מחדל", type: "boolean" },
      { key: "entityId", label: "ישות", type: "entity" },
    ],
    createFields: [
      { key: "name", label: "שם הכרטיס", type: "text", required: true },
      { key: "slug", label: "Slug", type: "text", required: true, autoSlug: true },
      { key: "isDefault", label: "ברירת מחדל", type: "checkbox", defaultValue: false },
    ],
  },
  categories: {
    title: "קטגוריות",
    titleEn: "Categories",
    icon: FolderTree,
    description: "קטגוריות היררכיות לסיווג רשומות בכל ישות",
    readEndpoint: "/claude/system/categories",
    duplicateBasePath: "/platform/categories",
    color: "lime",
    gradientFrom: "from-lime-500",
    gradientTo: "to-green-500",
    columns: [
      { key: "name", label: "שם" },
      { key: "slug", label: "Slug" },
      { key: "color", label: "צבע", type: "color" },
      { key: "entityId", label: "ישות", type: "entity" },
    ],
  },
  statuses: {
    title: "סטטוסים",
    titleEn: "Statuses",
    icon: CircleDot,
    description: "מכונת מצבים — סטטוסים, מעברים, צבעים, הגדרות מחזור חיים",
    readEndpoint: "/claude/system/statuses",
    createEndpoint: "/platform/entities/{parentId}/statuses",
    parentType: "entity",
    color: "sky",
    gradientFrom: "from-sky-500",
    gradientTo: "to-blue-500",
    showEntityGroup: true,
    columns: [
      { key: "name", label: "שם" },
      { key: "slug", label: "Slug" },
      { key: "color", label: "צבע", type: "color" },
      { key: "isDefault", label: "ברירת מחדל", type: "boolean" },
      { key: "isFinal", label: "סופי", type: "boolean" },
      { key: "entityId", label: "ישות", type: "entity" },
    ],
    createFields: [
      { key: "name", label: "שם הסטטוס", type: "text", required: true, placeholder: "לדוגמה: חדש, בטיפול, הושלם" },
      { key: "slug", label: "Slug", type: "text", required: true, autoSlug: true },
      { key: "color", label: "צבע", type: "select", options: STATUS_COLORS.map(c => ({ value: c.key, label: c.label })), defaultValue: "blue" },
      { key: "isDefault", label: "ברירת מחדל", type: "checkbox", defaultValue: false },
      { key: "isFinal", label: "סטטוס סופי", type: "checkbox", defaultValue: false },
    ],
  },
  buttons: {
    title: "כפתורים",
    titleEn: "Buttons",
    icon: MousePointerClick,
    description: "כפתורים מותאמים — מיקום, צבע, תנאי הצגה, פעולות",
    readEndpoint: "/claude/system/buttons",
    color: "indigo",
    gradientFrom: "from-indigo-500",
    gradientTo: "to-violet-500",
    columns: [
      { key: "name", label: "שם" },
      { key: "buttonType", label: "סוג", type: "badge" },
      { key: "position", label: "מיקום", type: "badge" },
      { key: "entityId", label: "ישות", type: "entity" },
    ],
  },
  actions: {
    title: "פעולות",
    titleEn: "Actions",
    icon: Zap,
    description: "פעולות עסקיות — יצירה, עדכון, מחיקה, אישור, ייצוא, custom",
    readEndpoint: "/claude/system/actions",
    createEndpoint: "/platform/entities/{parentId}/actions",
    parentType: "entity",
    color: "yellow",
    gradientFrom: "from-yellow-500",
    gradientTo: "to-amber-500",
    columns: [
      { key: "name", label: "שם" },
      { key: "slug", label: "Slug" },
      { key: "actionType", label: "סוג", type: "badge" },
      { key: "handlerType", label: "Handler", type: "badge" },
      { key: "entityId", label: "ישות", type: "entity" },
    ],
    createFields: [
      { key: "name", label: "שם הפעולה", type: "text", required: true },
      { key: "slug", label: "Slug", type: "text", required: true, autoSlug: true },
      { key: "actionType", label: "סוג פעולה", type: "select", options: [
        { value: "page", label: "דף" }, { value: "row", label: "שורה" },
        { value: "bulk", label: "פעולה מרובה" }, { value: "header", label: "כותרת" },
        { value: "contextual", label: "הקשרי" },
      ], defaultValue: "row" },
      { key: "handlerType", label: "סוג Handler", type: "select", options: [
        { value: "create", label: "יצירה" }, { value: "update", label: "עדכון" },
        { value: "delete", label: "מחיקה" }, { value: "duplicate", label: "שכפול" },
        { value: "status_change", label: "שינוי סטטוס" }, { value: "workflow", label: "Workflow" },
        { value: "modal", label: "חלון" }, { value: "navigate", label: "ניווט" },
        { value: "export", label: "ייצוא" }, { value: "import", label: "ייבוא" },
        { value: "print", label: "הדפסה" }, { value: "custom", label: "מותאם" },
      ], defaultValue: "custom" },
    ],
  },
  permissions: {
    title: "הרשאות",
    titleEn: "Permissions",
    icon: Shield,
    description: "מערכת הרשאות — לפי תפקיד, מודול, ישות, שדה, פעולה",
    readEndpoint: "/claude/system/permissions",
    color: "red",
    gradientFrom: "from-red-500",
    gradientTo: "to-pink-500",
    columns: [
      { key: "name", label: "שם" },
      { key: "permissionType", label: "סוג", type: "badge" },
      { key: "action", label: "פעולה", type: "badge" },
      { key: "scope", label: "היקף" },
    ],
  },
  menus: {
    title: "תפריטים",
    titleEn: "Menus",
    icon: MenuSquare,
    description: "תפריט מערכת דינמי — פריטים, היררכיה, אייקונים, סדר",
    readEndpoint: "/claude/system/menu-items",
    duplicateBasePath: "/platform/menu-items",
    color: "slate",
    gradientFrom: "from-slate-500",
    gradientTo: "to-gray-500",
    columns: [
      { key: "label", label: "תווית" },
      { key: "icon", label: "אייקון" },
      { key: "path", label: "נתיב" },
      { key: "sortOrder", label: "סדר" },
    ],
  },
  widgets: {
    title: "Widgets",
    titleEn: "Widgets",
    icon: LayoutGrid,
    description: "רכיבי תצוגה — count, chart, list, summary, KPI",
    readEndpoint: "/claude/system/widgets",
    duplicateBasePath: "/platform/widgets",
    color: "cyan",
    gradientFrom: "from-cyan-500",
    gradientTo: "to-blue-500",
    columns: [
      { key: "name", label: "שם" },
      { key: "widgetType", label: "סוג", type: "badge" },
      { key: "position", label: "מיקום" },
    ],
  },
  publish: {
    title: "גרסאות ופרסום",
    titleEn: "Publish & Versioning",
    icon: Upload,
    description: "ניהול גרסאות — טיוטות, preview, publish, archive, היסטוריה",
    readEndpoint: "/claude/system/versions",
    color: "green",
    gradientFrom: "from-green-500",
    gradientTo: "to-lime-500",
    columns: [
      { key: "version", label: "גרסה" },
      { key: "status", label: "סטטוס", type: "badge" },
      { key: "createdAt", label: "נוצר", type: "date" },
    ],
  },
};

function toSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "_")
    .replace(/-+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function BadgeCell({ value, color }: { value: string; color?: string }) {
  const colorClasses: Record<string, string> = {
    master: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    transaction: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    child: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    reference: "bg-muted/15 text-muted-foreground border-gray-500/30",
    log: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    system: "bg-red-500/15 text-red-400 border-red-500/30",
    document: "bg-green-500/15 text-green-400 border-green-500/30",
    analytics: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    create: "bg-green-500/15 text-green-400 border-green-500/30",
    edit: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    wizard: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    table: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    kanban: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    calendar: "bg-green-500/15 text-green-400 border-green-500/30",
    internal: "bg-muted/15 text-muted-foreground border-gray-500/30",
    api: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    workflow: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  };
  const cls = colorClasses[value?.toLowerCase()] || "bg-card/5 text-muted-foreground border-border/50";
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      {value || "—"}
    </span>
  );
}

function FieldTypeBadge({ fieldType }: { fieldType: string }) {
  const ft = FIELD_TYPE_MAP[fieldType];
  const categoryColors: Record<string, string> = {
    text: "bg-blue-500/15 text-blue-400",
    number: "bg-green-500/15 text-green-400",
    date: "bg-amber-500/15 text-amber-400",
    selection: "bg-purple-500/15 text-purple-400",
    boolean: "bg-orange-500/15 text-orange-400",
    relation: "bg-cyan-500/15 text-cyan-400",
    media: "bg-pink-500/15 text-pink-400",
    contact: "bg-indigo-500/15 text-indigo-400",
    advanced: "bg-red-500/15 text-red-400",
  };
  const cls = ft ? categoryColors[ft.category] || "bg-card/5 text-muted-foreground" : "bg-card/5 text-muted-foreground";
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {ft?.label || fieldType}
    </span>
  );
}

function ColorCell({ value }: { value: string }) {
  const sc = STATUS_COLORS.find(c => c.key === value);
  return (
    <span className="flex items-center gap-2">
      <span className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: sc?.hex || value }} />
      <span className="text-xs">{sc?.label || value}</span>
    </span>
  );
}

function CreateModal({ config, parentId, onClose, onSuccess }: {
  config: SectionConfig;
  parentId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const d: Record<string, any> = {};
    config.createFields?.forEach(f => { if (f.defaultValue !== undefined) d[f.key] = f.defaultValue; });
    return d;
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!config.createEndpoint || !parentId) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = config.createEndpoint.replace("{parentId}", String(parentId));
      const r = await authFetch(`${API}/${endpoint.replace(/^\//, "")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to create");
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (val: string) => {
    const updates: Record<string, any> = { name: val };
    config.createFields?.forEach(f => {
      if (f.autoSlug) updates[f.key] = toSlug(val);
    });
    setFormData(prev => ({ ...prev, ...updates }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl"
      >
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            {config.title} חדש
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-card/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {config.createFields?.map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium mb-1.5">{field.label} {field.required && <span className="text-red-400">*</span>}</label>
              {field.type === "text" && (
                <input
                  type="text"
                  value={formData[field.key] || ""}
                  onChange={e => field.key === "name" ? handleNameChange(e.target.value) : setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-colors"
                  dir={field.autoSlug ? "ltr" : "rtl"}
                />
              )}
              {field.type === "select" && (
                <select
                  value={formData[field.key] || field.defaultValue || ""}
                  onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-colors"
                >
                  <option value="">בחר...</option>
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {field.type === "checkbox" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formData[field.key]}
                    onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.checked }))}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-sm text-muted-foreground">פעיל</span>
                </label>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border/50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-card/5 transition-colors">ביטול</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            <Plus className="w-4 h-4" />
            צור
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ParentSelectorModal({ parentType, onSelect, onClose }: {
  parentType: "module" | "entity";
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const { modules } = usePlatformModules();
  const { data: entities = [] } = useQuery({
    queryKey: ["all-entities-overview"],
    queryFn: () => authFetch(`${API}/claude/system/entities`).then(r => r.json()),
    enabled: parentType === "entity",
  });
  const items = parentType === "module" ? modules : entities;
  const filtered = items.filter((item: any) =>
    (item.name || item.label || "").includes(search) || (item.slug || "").includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl"
      >
        <div className="p-6 border-b border-border/50">
          <h3 className="text-lg font-bold mb-3">
            {parentType === "module" ? "בחר מודול" : "בחר ישות"}
          </h3>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש..."
              className="w-full pr-10 pl-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {items.length === 0 ? `אין ${parentType === "module" ? "מודולים" : "ישויות"} עדיין` : "לא נמצאו תוצאות"}
            </div>
          ) : (
            filtered.map((item: any) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-card/5 transition-colors text-right"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {parentType === "module" ? <Package className="w-5 h-5 text-primary" /> : <Database className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.nameHe || item.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {item.slug}
                    {item.entityType && <span className="mr-2">· {item.entityType}</span>}
                    {item.fieldCount !== undefined && <span className="mr-2">· {item.fieldCount} שדות</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
              </button>
            ))
          )}
        </div>
        <div className="p-4 border-t border-border/50">
          <button onClick={onClose} className="w-full px-4 py-2 rounded-lg text-sm hover:bg-card/5 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function BuilderSection({ section }: { section: string }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const config = SECTION_CONFIG[section];
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showCreate, setShowCreate] = useState(false);
  const [parentId, setParentId] = useState<number | null>(null);
  const [showParentSelector, setShowParentSelector] = useState(false);
  const [groupBy, setGroupBy] = useState(!!config?.showEntityGroup);

  const { modules } = usePlatformModules();

  const { data: entities = [] } = useQuery({
    queryKey: ["entities-lookup"],
    queryFn: () => authFetch(`${API}/claude/system/entities`).then(r => r.json()),
  });

  const { data, isLoading, error } = useQuery<any[]>({
    queryKey: ["builder-section", section],
    queryFn: async () => {
      const r = await authFetch(`${API}${config.readEndpoint}`);
      if (!r.ok) throw new Error("Failed to fetch");
      const result = await r.json();
      return Array.isArray(result) ? result : result.data || [];
    },
    enabled: !!config,
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!config.duplicateBasePath) throw new Error("Duplicate not supported");
      const r = await authFetch(`${API}${config.duplicateBasePath}/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to duplicate");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["builder-section", section] }),
  });

  const moduleMap = useMemo(() => {
    const map: Record<number, string> = {};
    modules.forEach((m: any) => { map[m.id] = m.nameHe || m.name; });
    return map;
  }, [modules]);

  const entityMap = useMemo(() => {
    const map: Record<number, { name: string; slug: string }> = {};
    entities.forEach((e: any) => { map[e.id] = { name: e.nameHe || e.name, slug: e.slug }; });
    return map;
  }, [entities]);

  const items = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter((item: any) =>
      Object.values(item).some(v => String(v || "").toLowerCase().includes(q))
    );
  }, [data, searchQuery]);

  const groupedItems = useMemo(() => {
    if (!groupBy || !config?.showEntityGroup) return null;
    const groups: Record<number, { name: string; items: any[] }> = {};
    items.forEach((item: any) => {
      const eid = item.entityId;
      if (!groups[eid]) {
        groups[eid] = { name: entityMap[eid]?.name || `Entity #${eid}`, items: [] };
      }
      groups[eid].items.push(item);
    });
    return groups;
  }, [items, groupBy, config, entityMap]);

  const stats = useMemo(() => {
    if (!data) return [];
    const total = data.length;
    const statsList: { label: string; value: number; color: string }[] = [{ label: "סה\"כ", value: total, color: "text-foreground" }];
    if (section === "entities") {
      const byType: Record<string, number> = {};
      data.forEach((e: any) => { byType[e.entityType] = (byType[e.entityType] || 0) + 1; });
      Object.entries(byType).forEach(([type, count]) => {
        const et = ENTITY_TYPES.find(t => t.key === type);
        statsList.push({ label: et?.label?.split(" ")[0] || type, value: count, color: "text-muted-foreground" });
      });
    }
    if (section === "fields") {
      const byType: Record<string, number> = {};
      data.forEach((f: any) => { byType[f.fieldType] = (byType[f.fieldType] || 0) + 1; });
      const top3 = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3);
      top3.forEach(([type, count]) => {
        const ft = FIELD_TYPE_MAP[type];
        statsList.push({ label: ft?.label || type, value: count, color: "text-muted-foreground" });
      });
    }
    return statsList;
  }, [data, section]);

  if (!config) {
    return <div className="text-center text-muted-foreground py-20">Section not found</div>;
  }

  const Icon = config.icon;

  const handleCreateClick = () => {
    if (!config.createEndpoint || !config.parentType) return;
    setShowParentSelector(true);
  };

  const handleParentSelected = (id: number) => {
    setParentId(id);
    setShowParentSelector(false);
    setShowCreate(true);
  };

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["builder-section", section] });
  };

  const renderCellValue = (item: any, col: { key: string; type?: string }) => {
    const value = item[col.key];
    switch (col.type) {
      case "boolean":
        return value ? (
          <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-400 flex items-center justify-center"><CheckCircle className="w-3.5 h-3.5" /></span>
        ) : (
          <span className="w-5 h-5 rounded-full bg-card/5 text-muted-foreground/30 flex items-center justify-center"><X className="w-3.5 h-3.5" /></span>
        );
      case "badge":
        return <BadgeCell value={value} />;
      case "color":
        return <ColorCell value={value} />;
      case "fieldType":
        return <FieldTypeBadge fieldType={value} />;
      case "entity":
        return entityMap[value] ? (
          <Link href={`/builder/entity/${value}`} className="flex items-center gap-1.5 text-primary/80 hover:text-primary transition-colors text-xs">
            <Database className="w-3 h-3" />
            {entityMap[value].name}
          </Link>
        ) : <span className="text-muted-foreground text-xs">#{value}</span>;
      case "module":
        return moduleMap[value] ? (
          <Link href={`/builder/module/${value}`} className="flex items-center gap-1.5 text-primary/80 hover:text-primary transition-colors text-xs">
            <Package className="w-3 h-3" />
            {moduleMap[value]}
          </Link>
        ) : <span className="text-muted-foreground text-xs">#{value}</span>;
      case "link":
        return <span className="font-medium">{value || "—"}</span>;
      case "date":
        return value ? <span className="text-xs text-muted-foreground">{new Date(value).toLocaleDateString("he-IL")}</span> : <span className="text-muted-foreground">—</span>;
      default:
        if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
        if (typeof value === "boolean") return value ? "✓" : "✗";
        return <span className="text-sm">{String(value)}</span>;
    }
  };

  const renderTable = (tableItems: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/50 bg-card/[0.02]">
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-12">
              #
            </th>
            {config.columns.map(col => (
              <th key={col.key} className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {col.label}
              </th>
            ))}
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-24">
              פעולות
            </th>
          </tr>
        </thead>
        <tbody>
          {tableItems.map((item: any, idx: number) => (
            <motion.tr
              key={item.id || idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              className="border-b border-border/20 hover:bg-card/[0.03] transition-all group cursor-pointer"
              onClick={() => {
                if (config.getDetailLink) navigate(config.getDetailLink(item));
                else if (item.entityId) navigate(`/builder/entity/${item.entityId}`);
              }}
            >
              <td className="px-4 py-3 text-xs text-muted-foreground/50 font-mono">{item.id || idx + 1}</td>
              {config.columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-sm" onClick={e => { if (col.type === "entity" || col.type === "module") e.stopPropagation(); }}>
                  {renderCellValue(item, col)}
                </td>
              ))}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {config.getDetailLink && (
                    <button
                      onClick={e => { e.stopPropagation(); navigate(config.getDetailLink!(item)); }}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      title="עריכה"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {item.entityId && (
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/builder/entity/${item.entityId}`); }}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      title="פתח ישות"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {item.entityId && (
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/builder/data/${item.entityId}`); }}
                      className="p-1.5 rounded-lg hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors"
                      title="נתונים"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {config.duplicateBasePath && item.id && (
                    <button
                      onClick={e => { e.stopPropagation(); duplicateMutation.mutate(item.id); }}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      title="שכפול"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderCards = (cardItems: any[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {cardItems.map((item: any, idx: number) => (
        <motion.div
          key={item.id || idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(idx * 0.03, 0.3) }}
          onClick={() => {
            if (config.getDetailLink) navigate(config.getDetailLink(item));
            else if (item.entityId) navigate(`/builder/entity/${item.entityId}`);
          }}
          className="p-4 rounded-xl bg-card/[0.02] border border-border/40 hover:border-primary/30 hover:bg-card/[0.04] transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} flex items-center justify-center`}>
                <Icon className="w-4 h-4 text-foreground" />
              </div>
              <div>
                <div className="font-medium text-sm">{item.nameHe || item.name || item.label || `#${item.id}`}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{item.slug || item.fieldKey || ""}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {config.duplicateBasePath && item.id && (
                <button onClick={e => { e.stopPropagation(); duplicateMutation.mutate(item.id); }}
                  className="p-1 rounded hover:bg-primary/10 text-muted-foreground/50 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                  title="שכפול"><Copy className="w-3.5 h-3.5" /></button>
              )}
              <span className="text-[10px] text-muted-foreground/50">#{item.id}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {config.columns.slice(2).map(col => (
              <div key={col.key} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{col.label}</span>
                {renderCellValue(item, col)}
              </div>
            ))}
          </div>
          {(item.entityId || item.moduleId) && (
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2 text-[11px] text-muted-foreground">
              {item.entityId && entityMap[item.entityId] && (
                <span className="flex items-center gap-1"><Database className="w-3 h-3" />{entityMap[item.entityId].name}</span>
              )}
              {item.moduleId && moduleMap[item.moduleId] && (
                <span className="flex items-center gap-1"><Package className="w-3 h-3" />{moduleMap[item.moduleId]}</span>
              )}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} flex items-center justify-center shadow-lg shadow-${config.color}-500/20`}>
            <Icon className="w-7 h-7 text-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">{config.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{config.description}</p>
          </div>
        </div>
        {config.createEndpoint && config.createFields && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreateClick}
            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            {config.title} חדש
          </motion.button>
        )}
      </motion.div>

      {stats.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center gap-3 flex-wrap">
          {stats.map((s, i) => (
            <div key={i} className="px-3 py-2 rounded-xl bg-card border border-border/50 flex items-center gap-2">
              <span className={`text-lg font-bold ${i === 0 ? "text-primary" : s.color}`}>{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`חיפוש ב${config.title}...`}
            className="w-full pr-10 pl-3 py-2 rounded-xl bg-card border border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none text-sm transition-all"
          />
        </div>
        {config.showEntityGroup && (
          <button
            onClick={() => setGroupBy(!groupBy)}
            className={`p-2 rounded-xl border transition-colors ${groupBy ? "bg-primary/10 border-primary/30 text-primary" : "bg-card border-border/50 text-muted-foreground hover:text-foreground"}`}
            title="קיבוץ לפי ישות"
          >
            <Layers className="w-4 h-4" />
          </button>
        )}
        <div className="flex rounded-xl border border-border/50 overflow-hidden">
          <button
            onClick={() => setViewMode("table")}
            className={`p-2 transition-colors ${viewMode === "table" ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`p-2 transition-colors ${viewMode === "cards" ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:text-foreground"}`}
          >
            <Grid3x3 className="w-4 h-4" />
          </button>
        </div>
        <div className="px-3 py-2 rounded-xl bg-card border border-border/50 text-sm flex items-center gap-1.5">
          <Hash className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold">{items.length}</span>
          <span className="text-muted-foreground text-xs">פריטים</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {isLoading ? (
          <div className="bg-card border border-border rounded-2xl">
            <LoadingSkeleton variant="list" rows={5} />
          </div>
        ) : error ? (
          <div className="bg-card border border-red-500/20 rounded-2xl">
            <div className="text-center py-20">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
              <p className="text-red-400 font-medium">שגיאה בטעינת נתונים</p>
              <p className="text-xs text-muted-foreground mt-2">{String(error)}</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl">
            <EmptyState
              icon={Icon}
              title={searchQuery ? `לא נמצאו תוצאות עבור "${searchQuery}"` : `אין ${config.title} עדיין`}
              variant={searchQuery ? "search" : "default"}
            />
          </div>
        ) : groupBy && groupedItems ? (
          <div className="space-y-4">
            {Object.entries(groupedItems).map(([entityId, group]) => (
              <div key={entityId} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-card/[0.02] border-b border-border/50">
                  <Database className="w-4 h-4 text-primary" />
                  <Link href={`/builder/entity/${entityId}`} className="font-medium text-sm hover:text-primary transition-colors">
                    {group.name}
                  </Link>
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-card/5">{group.items.length}</span>
                  <div className="flex-1" />
                  <Link href={`/builder/data/${entityId}`} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    נתונים
                  </Link>
                </div>
                {viewMode === "table" ? renderTable(group.items) : renderCards(group.items)}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {viewMode === "table" ? renderTable(items) : renderCards(items)}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showParentSelector && config.parentType && (
          <ParentSelectorModal
            parentType={config.parentType}
            onSelect={handleParentSelected}
            onClose={() => setShowParentSelector(false)}
          />
        )}
        {showCreate && parentId && config.createFields && (
          <CreateModal
            config={config}
            parentId={parentId}
            onClose={() => { setShowCreate(false); setParentId(null); }}
            onSuccess={handleCreateSuccess}
          />
        )}
      </AnimatePresence>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
      <ActivityLog entityType="builder-section" />
      <RelatedRecords entityType="builder-section" />
    </div>
    </div>
  );
}
