import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { LoadingOverlay } from "@/components/ui/unified-states";
import {
  ChevronLeft, Plus, Search, Download, Edit2, Trash2, Eye,
  ChevronDown, ChevronUp, X, Filter, ArrowUpDown,
  Database, Table2, Columns3, CalendarDays, LayoutGrid,
  Upload, Check, AlertCircle, Zap, Play, Home, FileText, CheckSquare,
  Activity, Archive, Award, BarChart3, Bell, Bot, Box, Boxes, Brain,
  Briefcase, Building2, Calculator, Clock, CreditCard, DollarSign,
  Factory, FileCheck, FileCode, FolderTree, Globe, GitBranch,
  Landmark, Layers, LayoutDashboard, List, Mail, MapPin, Menu,
  MessageSquare, Package, PackageCheck, Plug, Receipt, Settings,
  Shield, ShieldCheck, ShoppingCart, Sparkles, Star, Target,
  TrendingUp, Truck, User, Users, Wallet, Warehouse, Wrench
} from "lucide-react";
import { FIELD_TYPE_MAP, STATUS_COLORS } from "./builder/field-type-registry.ts";
import { renderCellValueEnhanced } from "./builder/form-field-components";
import KanbanView from "./builder/kanban-view";
import CalendarView from "./builder/calendar-view";
import SummaryCardsView from "./builder/summary-cards-view";
import DynamicFormRenderer from "./builder/dynamic-form-renderer";
import DynamicDetailPage from "./builder/dynamic-detail-page";
import AISmartActions from "@/components/ai/ai-smart-actions";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, AlertCircle, Archive, Award, BarChart3, Bell, Bot, Box, Boxes, Brain,
  Briefcase, Building2, Calculator, CalendarDays, Check, CheckSquare, Clock, CreditCard,
  Database, DollarSign, Eye, Factory, FileCheck, FileCode, FileText, FolderTree,
  Globe, GitBranch, Home, Landmark, Layers, LayoutDashboard, LayoutGrid, List,
  Mail, MapPin, Menu, MessageSquare, Package, PackageCheck, Plug, Receipt,
  Search, Settings, Shield, ShieldCheck, ShoppingCart, Sparkles, Star, Table2, Target,
  TrendingUp, Truck, Upload, User, Users, Wallet, Warehouse, Wrench, X, Zap,
};
function getLucideIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[iconName] || Database;
}

interface FilterRow {
  id: string;
  field: string;
  operator: string;
  value: any;
}

const FILTER_OPERATORS = [
  { value: "equals", label: "שווה", needsValue: true },
  { value: "not_equals", label: "לא שווה", needsValue: true },
  { value: "contains", label: "מכיל", needsValue: true },
  { value: "starts_with", label: "מתחיל ב", needsValue: true },
  { value: "gt", label: "גדול מ", needsValue: true },
  { value: "lt", label: "קטן מ", needsValue: true },
  { value: "is_empty", label: "ריק", needsValue: false },
  { value: "is_not_empty", label: "לא ריק", needsValue: false },
];

function renderCellValue(value: any, field: any): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">-</span>;
  const type = field.fieldType;
  if (type === "boolean" || type === "checkbox") return value ? "✓" : "✗";
  if (type === "date") return new Date(value).toLocaleDateString("he-IL");
  if (type === "datetime") return new Date(value).toLocaleString("he-IL");
  if (type === "currency") return `₪${Number(value).toLocaleString()}`;
  if (type === "percent") return `${value}%`;
  if (type === "email") return <a href={`mailto:${value}`} className="text-primary hover:underline">{value}</a>;
  if (type === "url") return <a href={value} target="_blank" className="text-primary hover:underline" rel="noreferrer">{value}</a>;
  if (type === "phone") return <a href={`tel:${value}`} className="text-primary hover:underline">{value}</a>;
  if (type === "tags" || type === "multi_select") {
    const arr = Array.isArray(value) ? value : [];
    return <div className="flex gap-1 flex-wrap">{arr.map((v: string, i: number) => <span key={i} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">{v}</span>)}</div>;
  }
  if (type === "formula" || type === "computed") return <span className="font-mono text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">{typeof value === "number" ? value.toLocaleString() : String(value)}</span>;
  if (type === "auto_number") return <span className="font-mono text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">{String(value)}</span>;
  const enhanced = renderCellValueEnhanced(value, field);
  if (enhanced !== null) return enhanced;
  if (typeof value === "string" && value.length > 60) return value.slice(0, 60) + "...";
  return String(value);
}

export default function ModuleView() {
  const { entityId } = useParams<{ entityId: string }>();
  const eId = Number(entityId);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [viewRecord, setViewRecord] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [filterCombinator, setFilterCombinator] = useState<"and" | "or">("and");
  const [viewTypeOverride, setViewTypeOverride] = useState<string | null>(null);
  const pageSize = 25;

  const { data: entity } = useQuery({
    queryKey: ["platform-entity", eId],
    queryFn: () => authFetch(`${API}/platform/entities/${eId}`).then(r => r.json()),
  });

  const { data: parentModule } = useQuery({
    queryKey: ["platform-module-for-entity", entity?.moduleId],
    queryFn: () => authFetch(`${API}/platform/modules/${entity.moduleId}`).then(r => r.json()),
    enabled: !!entity?.moduleId,
  });

  const { data: views = [] } = useQuery({
    queryKey: ["entity-views", eId],
    queryFn: async () => { const r = await authFetch(`${API}/platform/entities/${eId}/views`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!entity,
  });

  const { data: forms = [] } = useQuery({
    queryKey: ["entity-forms", eId],
    queryFn: async () => { const r = await authFetch(`${API}/platform/entities/${eId}/forms`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!entity,
  });

  const { data: detailDefs = [] } = useQuery({
    queryKey: ["entity-details", eId],
    queryFn: async () => { const r = await authFetch(`${API}/platform/entities/${eId}/details`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!entity,
  });

  const { data: relations = [] } = useQuery({
    queryKey: ["entity-relations", eId],
    queryFn: () => authFetch(`${API}/platform/entities/${eId}/relations`).then(r => r.json()),
    enabled: !!entity,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["entity-categories", eId],
    queryFn: () => authFetch(`${API}/platform/entities/${eId}/categories`).then(r => r.json()),
    enabled: !!entity,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["entity-actions", eId],
    queryFn: () => authFetch(`${API}/platform/entities/${eId}/actions`).then(r => r.json()),
    enabled: !!entity,
  });

  const { data: validationRules = [] } = useQuery({
    queryKey: ["entity-validations", eId],
    queryFn: () => authFetch(`${API}/platform/entities/${eId}/validations`).then(r => r.json()),
    enabled: !!entity,
  });

  const { data: transitions = [] } = useQuery({
    queryKey: ["entity-transitions", eId],
    queryFn: () => authFetch(`${API}/platform/entities/${eId}/transitions`).then(r => r.json()),
    enabled: !!entity,
  });

  const { data: buttonDefs = [] } = useQuery({
    queryKey: ["entity-button-definitions", eId],
    queryFn: async () => { const r = await authFetch(`${API}/platform/entities/${eId}/button-definitions`); if (!r.ok) return []; return r.json(); },
    enabled: !!entity,
  });

  const activeView = useMemo(() => {
    if (activeViewId) return views.find((v: any) => v.id === activeViewId) || null;
    return views.find((v: any) => v.isDefault) || null;
  }, [views, activeViewId]);

  const effectiveSortBy = useMemo(() => {
    if (sortBy) return sortBy;
    if (activeView?.sorting?.[0]?.fieldSlug) return activeView.sorting[0].fieldSlug;
    return "";
  }, [sortBy, activeView]);

  const effectiveSortDir = useMemo(() => {
    if (sortBy) return sortDir;
    if (activeView?.sorting?.[0]?.direction) return activeView.sorting[0].direction;
    return "desc";
  }, [sortBy, sortDir, activeView]);

  const activeFiltersParam = useMemo(() => {
    const validFilters = filterRows.filter(f => f.field && f.operator);
    if (validFilters.length === 0) return undefined;
    return JSON.stringify({ filters: validFilters.map(f => ({ field: f.field, operator: f.operator, value: f.value })), combinator: filterCombinator });
  }, [filterRows, filterCombinator]);

  const { data: recordsData, isLoading: loadingRecords } = useQuery({
    queryKey: ["entity-records", eId, search, effectiveSortBy, effectiveSortDir, page, categoryFilter, activeFiltersParam],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
      if (search) params.set("search", search);
      if (effectiveSortBy) { params.set("sortBy", effectiveSortBy); params.set("sortDir", effectiveSortDir); }
      if (categoryFilter) params.set("category", categoryFilter);
      if (activeFiltersParam) params.set("filters", activeFiltersParam);
      return authFetch(`${API}/platform/entities/${eId}/records?${params}`).then(r => r.json());
    },
    enabled: !!entity,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => authFetch(`${API}/platform/entities/${eId}/records`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => authFetch(`${API}/platform/records/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }); setEditRecord(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/records/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => authFetch(`${API}/platform/records/bulk/delete`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, entityId: eId }),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }); setSelectedRows(new Set()); },
  });

  const fields = entity?.fields || [];
  const statuses = entity?.statuses || [];
  const rawRecords = recordsData?.records || [];
  const total = recordsData?.total || 0;

  const records = useMemo(() => {
    if (!activeView?.filters?.length) return rawRecords;
    return rawRecords.filter((rec: any) => {
      const data = rec.data || {};
      return activeView.filters.every((filter: any) => {
        const val = String(data[filter.fieldSlug] ?? "");
        const filterVal = String(filter.value ?? "");
        switch (filter.operator) {
          case "equals": return val === filterVal;
          case "not_equals": return val !== filterVal;
          case "contains": return val.toLowerCase().includes(filterVal.toLowerCase());
          case "is_empty": return !val || val === "undefined" || val === "null";
          case "is_not_empty": return !!val && val !== "undefined" && val !== "null";
          default: return true;
        }
      });
    });
  }, [rawRecords, activeView]);

  const totalPages = Math.ceil(total / pageSize);
  const listFields = useMemo(() => {
    if (activeView?.columns?.length) return activeView.columns.filter((c: any) => c.visible !== false).map((c: any) => fields.find((f: any) => f.slug === c.fieldSlug)).filter(Boolean);
    return fields.filter((f: any) => f.showInList);
  }, [fields, activeView]);

  const getFormForMode = (mode: "create" | "edit") => {
    return forms.find((f: any) => f.formType === mode && f.isDefault) || forms.find((f: any) => f.formType === mode) || forms.find((f: any) => f.isDefault) || forms[0] || null;
  };

  const defaultDetail = useMemo(() => detailDefs.find((d: any) => d.isDefault) || detailDefs[0] || null, [detailDefs]);

  const handleSort = (slug: string) => {
    if (sortBy === slug) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(slug); setSortDir("asc"); }
  };

  const rowActions = actions.filter((a: any) =>
    ["row", "contextual"].includes(a.actionType) && a.isActive &&
    (a.handlerType !== "delete" || isSuperAdmin)
  );
  const toolbarButtons = buttonDefs.filter((b: any) => b.placement === "toolbar" && b.isActive);
  const headerActions = actions.filter((a: any) => ["page", "header"].includes(a.actionType) && a.isActive);

  const executeAction = async (action: any, record: any) => {
    const config = action.handlerConfig || {};
    switch (action.handlerType) {
      case "status_change": if (record && config.targetStatus) await updateMutation.mutateAsync({ id: record.id, status: config.targetStatus }); break;
      case "duplicate": if (record) await createMutation.mutateAsync({ data: record.data, status: record.status }); break;
      case "navigate": if (config.url) setLocation(config.url); break;
      case "delete": if (record && isSuperAdmin) { const ok = await globalConfirm("מחיקת רשומה", { itemName: `#${record.id}`, entityType: "רשומה" }); if (ok) deleteMutation.mutate(record.id); } break;
      case "create": setShowForm(true); break;
    }
  };

  const addFilterRow = () => setFilterRows(prev => [...prev, { id: crypto.randomUUID(), field: "", operator: "equals", value: "" }]);
  const updateFilterRow = (id: string, updates: Partial<FilterRow>) => setFilterRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  const removeFilterRow = (id: string) => setFilterRows(prev => prev.filter(r => r.id !== id));
  const activeFilterCount = filterRows.filter(f => f.field && f.operator).length;

  const toggleSelectRow = (id: number) => setSelectedRows(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleSelectAll = () => { if (selectedRows.size === records.length) setSelectedRows(new Set()); else setSelectedRows(new Set(records.map((r: any) => r.id))); };

  if (!entity) return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded bg-muted/20" />
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded bg-muted/15" />
          <div className="h-9 w-20 rounded bg-muted/15" />
        </div>
      </div>
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 w-full rounded bg-muted/10" />
          ))}
        </div>
      </div>
    </div>
  );

  const EntityIcon = getLucideIcon(entity.icon || "FileText");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <Home className="w-3.5 h-3.5" />
          ראשי
        </Link>
        {parentModule && (
          <>
            <ChevronLeft className="w-3 h-3" />
            <span className="hover:text-foreground transition-colors cursor-default">{parentModule.name}</span>
          </>
        )}
        <ChevronLeft className="w-3 h-3" />
        <span className="text-foreground font-medium">{entity.namePlural}</span>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <EntityIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">{entity.namePlural}</h1>
            <p className="text-sm text-muted-foreground">{total} רשומות</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toolbarButtons.map((btn: any) => {
            const BtnIcon = getLucideIcon(btn.icon || "Zap");
            const colorDef = STATUS_COLORS.find(c => c.key === btn.color);
            return (
              <button key={btn.id} onClick={() => {
                if (btn.actionType === "navigate" && btn.config?.url) setLocation(btn.config.url);
                else if (btn.actionType === "create") setShowForm(true);
              }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors"
                style={{ borderColor: colorDef?.hex || "#6b7280", backgroundColor: `${colorDef?.hex || "#6b7280"}15`, color: colorDef?.hex || "#6b7280" }}>
                <BtnIcon className="w-3.5 h-3.5" />
                {btn.label || btn.name}
              </button>
            );
          })}
          {headerActions.map((action: any) => {
            const colorDef = STATUS_COLORS.find(c => c.key === action.color);
            return (
              <button key={action.id} onClick={() => executeAction(action, null)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors"
                style={{ borderColor: colorDef?.hex || "#6b7280", backgroundColor: `${colorDef?.hex || "#6b7280"}15`, color: colorDef?.hex || "#6b7280" }}>
                <Play className="w-3.5 h-3.5" />
                {action.name}
              </button>
            );
          })}
          <AISmartActions
            entityName={entity.namePlural || entity.name}
            entityId={eId}
            records={records}
            fields={fields}
          />
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-5 h-5" />
            {entity.name} חדש
          </button>
        </div>
      </div>

      {selectedRows.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <CheckSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{selectedRows.size} רשומות נבחרו</span>
          {isSuperAdmin && (
            <button onClick={async () => { const ok = await globalConfirm("מחיקה מרובה", { itemName: `${selectedRows.size} רשומות`, entityType: "רשומה" }); if (ok) bulkDeleteMutation.mutate(Array.from(selectedRows)); }}
              className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-xs font-medium hover:bg-destructive/90 mr-4">
              מחק נבחרים
            </button>
          )}
          <button onClick={() => setSelectedRows(new Set())} className="mr-auto text-xs text-muted-foreground hover:text-foreground">נקה בחירה</button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder={`חיפוש ב${entity.namePlural}...`}
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <button onClick={() => { setShowFilters(!showFilters); if (!showFilters && filterRows.length === 0) addFilterRow(); }}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${activeFilterCount > 0 ? "bg-primary/10 text-primary border-primary/30" : "bg-card border-border hover:bg-muted"}`}>
          <Filter className="w-4 h-4" />
          סינון
          {activeFilterCount > 0 && <span className="px-1.5 py-0.5 bg-primary text-primary-foreground rounded-md text-xs">{activeFilterCount}</span>}
        </button>
        {views.length > 0 && (
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
            {views.map((v: any) => (
              <button key={v.id} onClick={() => { setActiveViewId(v.id); setViewTypeOverride(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${(activeViewId === v.id || (!activeViewId && v.isDefault)) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {v.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-0.5 bg-card border border-border rounded-xl p-1">
          {([
            { type: "table", icon: Table2, label: "טבלה" },
            { type: "kanban", icon: Columns3, label: "קנבן" },
            { type: "calendar", icon: CalendarDays, label: "לוח שנה" },
            { type: "cards", icon: LayoutGrid, label: "כרטיסים" },
          ] as const).map(vt => {
            const currentType = viewTypeOverride || activeView?.viewType || "table";
            const Icon = vt.icon;
            return (
              <button key={vt.type} onClick={() => setViewTypeOverride(vt.type)} title={vt.label}
                className={`p-1.5 rounded-lg transition-colors ${currentType === vt.type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
        {categories.length > 0 && (
          <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(0); }}
            className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">כל הקטגוריות</option>
            {categories.map((cat: any) => <option key={cat.id} value={cat.slug}>{cat.name}</option>)}
          </select>
        )}
      </div>

      {showFilters && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">סינון מתקדם</h3>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <button onClick={() => setFilterCombinator("and")} className={`px-2 py-1 rounded text-xs font-medium ${filterCombinator === "and" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>AND</button>
                <button onClick={() => setFilterCombinator("or")} className={`px-2 py-1 rounded text-xs font-medium ${filterCombinator === "or" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>OR</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {filterRows.length > 0 && <button onClick={() => { setFilterRows([]); setPage(0); }} className="text-xs text-muted-foreground hover:text-foreground">נקה הכל</button>}
              <button onClick={() => setShowFilters(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
          </div>
          {filterRows.map((row, idx) => (
            <div key={row.id} className="flex items-center gap-2">
              {idx > 0 && <span className="text-xs text-muted-foreground w-10 text-center">{filterCombinator === "and" ? "וגם" : "או"}</span>}
              {idx === 0 && <span className="w-10" />}
              <select value={row.field} onChange={e => updateFilterRow(row.id, { field: e.target.value })} className="flex-1 max-w-[200px] px-2 py-2 bg-background border border-border rounded-lg text-sm">
                <option value="">בחר שדה...</option>
                {fields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
              </select>
              <select value={row.operator} onChange={e => updateFilterRow(row.id, { operator: e.target.value })} className="flex-1 max-w-[180px] px-2 py-2 bg-background border border-border rounded-lg text-sm">
                {FILTER_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              {FILTER_OPERATORS.find(op => op.value === row.operator)?.needsValue !== false && (
                <input value={row.value ?? ""} onChange={e => updateFilterRow(row.id, { value: e.target.value })} placeholder="ערך..." className="flex-1 max-w-[200px] px-2 py-2 bg-background border border-border rounded-lg text-sm" />
              )}
              <button onClick={() => removeFilterRow(row.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><X className="w-3.5 h-3.5 text-destructive" /></button>
            </div>
          ))}
          <button onClick={addFilterRow} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium">
            <Plus className="w-3.5 h-3.5" />הוסף תנאי
          </button>
        </div>
      )}

      {(() => {
        const currentViewType = viewTypeOverride || activeView?.viewType || "table";
        if (loadingRecords) return (
          <LoadingOverlay className="min-h-[200px]">
            <div className="bg-card border border-border/50 rounded-xl p-4 space-y-2 animate-pulse">
              <div className="flex gap-4 border-b border-border/30 pb-2">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-4 flex-1 rounded bg-muted/20" />)}
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 py-2">
                  {Array.from({ length: 5 }).map((_, j) => <div key={j} className="h-3 flex-1 rounded bg-muted/10" />)}
                </div>
              ))}
            </div>
          </LoadingOverlay>
        );
        if (records.length === 0) return (
          <div className="bg-card border border-border rounded-2xl py-12 text-center">
            <Database className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{search || activeFilterCount > 0 ? "לא נמצאו תוצאות" : "אין רשומות עדיין"}</p>
            <button onClick={() => setShowForm(true)} className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
              <Plus className="w-4 h-4 inline ml-1" />צור {entity.name} ראשון
            </button>
          </div>
        );
        if (currentViewType === "kanban") return <KanbanView records={records} fields={fields} statuses={statuses} entity={entity} activeView={activeView} entityId={eId} onViewRecord={setViewRecord} onEditRecord={setEditRecord} />;
        if (currentViewType === "calendar") return <CalendarView records={records} fields={fields} statuses={statuses} entity={entity} activeView={activeView} entityId={eId} onViewRecord={setViewRecord} onEditRecord={setEditRecord} />;
        if (currentViewType === "cards" || currentViewType === "summary") return <SummaryCardsView records={records} fields={fields} statuses={statuses} entity={entity} activeView={activeView} entityId={eId} onViewRecord={setViewRecord} onEditRecord={setEditRecord} onDeleteRecord={(id) => deleteMutation.mutate(id)} canDelete={isSuperAdmin} />;
        return (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-center px-3 py-3 w-10">
                      <input type="checkbox" checked={records.length > 0 && selectedRows.size === records.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-border text-primary cursor-pointer" />
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground w-12">#</th>
                    {listFields.map((f: any) => (
                      <th key={f.slug} className="text-right px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => f.isSortable && handleSort(f.slug)}>
                        <div className="flex items-center gap-1">
                          {f.name}
                          {effectiveSortBy === f.slug && (effectiveSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                    ))}
                    {statuses.length > 0 && <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">סטטוס</th>}
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-24">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec: any) => {
                    const data = rec.data || {};
                    const statusDef = statuses.find((s: any) => s.slug === rec.status);
                    const statusColorDef = STATUS_COLORS.find(c => c.key === statusDef?.color);
                    const isSelected = selectedRows.has(rec.id);
                    return (
                      <tr key={rec.id} className={`border-b border-border/50 last:border-0 transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                        <td className="text-center px-3 py-3">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(rec.id)} className="w-4 h-4 rounded border-border text-primary cursor-pointer" />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{rec.id}</td>
                        {listFields.map((f: any) => (
                          <td key={f.slug} className="px-4 py-3 text-sm">{renderCellValue(data[f.slug], f)}</td>
                        ))}
                        {statuses.length > 0 && (
                          <td className="px-4 py-3">
                            {statusDef ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${statusColorDef?.hex || "#6b7280"}20`, color: statusColorDef?.hex || "#6b7280" }}>
                                {statusDef.name}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">-</span>}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setViewRecord(rec)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={() => setEditRecord(rec)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            {rowActions.map((action: any) => (
                              <button key={action.id} onClick={() => executeAction(action, rec)} className="p-1.5 hover:bg-muted rounded-lg" title={action.name}>
                                <Zap className="w-3.5 h-3.5 text-primary" />
                              </button>
                            ))}
                            {isSuperAdmin && (
                              <button onClick={async () => { const ok = await globalConfirm("מחיקת רשומה", { itemName: `#${rec.id}`, entityType: "רשומה" }); if (ok) deleteMutation.mutate(rec.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg">
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">עמוד {page + 1} מתוך {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 bg-muted rounded-lg text-sm disabled:opacity-50">הקודם</button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 bg-muted rounded-lg text-sm disabled:opacity-50">הבא</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <AnimatePresence>
        {(showForm || editRecord) && (
          <DynamicFormRenderer
            fields={fields.filter((f: any) => f.showInForm)}
            allFields={fields}
            statuses={statuses}
            record={editRecord}
            entityName={entity.name}
            entityId={eId}
            formDefinition={getFormForMode(editRecord ? "edit" : "create")}
            validationRules={validationRules}
            transitions={transitions}
            relations={relations}
            onClose={() => { setShowForm(false); setEditRecord(null); }}
            onSubmit={(data) => {
              if (editRecord) updateMutation.mutate({ id: editRecord.id, ...data });
              else createMutation.mutate(data);
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
        {viewRecord && (
          <DynamicDetailPage
            record={viewRecord}
            fields={fields}
            statuses={statuses}
            entityName={entity.name}
            entityId={eId}
            detailDefinition={defaultDetail}
            relations={relations}
            actions={actions}
            onClose={() => setViewRecord(null)}
            onEdit={() => { setEditRecord(viewRecord); setViewRecord(null); }}
            onExecuteAction={(action: any) => executeAction(action, viewRecord)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
