import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Plus, Search, Download, Edit2, Trash2, Eye,
  ChevronDown, ChevronUp, X, Filter, SlidersHorizontal, ArrowUpDown,
  FileText, Database, CheckSquare, Calendar, Hash, Type, Mail,
  Phone, Globe, MapPin, Image, Paperclip, ToggleRight, List,
  Tags, Activity, Table2, ArrowLeftRight, LinkIcon,
  Zap, Copy, FolderTree, Play, ArrowRight, Upload, Check, AlertCircle,
  LayoutGrid, Columns3, CalendarDays
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { FIELD_TYPE_MAP, STATUS_COLORS } from "./field-type-registry";
import { runValidations } from "./validation-builder";
import { InlineChildGrid, InlineChildGridReadOnly } from "./inline-child-grid";
import { RichTextField, SignatureField, BarcodeDisplay, QRDisplay, JsonEditor, renderCellValueEnhanced } from "./form-field-components";
import KanbanView from "./kanban-view";
import CalendarView from "./calendar-view";
import SummaryCardsView from "./summary-cards-view";
import MessagingActions from "@/components/messaging/messaging-actions";
import { usePermissions } from "@/hooks/use-permissions";
import DynamicFormRenderer from "./dynamic-form-renderer";
import { EmptyState, LoadingSkeleton } from "@/components/ui/unified-states";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";

const API = "/api";
const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
};

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
  { value: "not_contains", label: "לא מכיל", needsValue: true },
  { value: "starts_with", label: "מתחיל ב", needsValue: true },
  { value: "gt", label: "גדול מ", needsValue: true },
  { value: "lt", label: "קטן מ", needsValue: true },
  { value: "gte", label: "גדול או שווה", needsValue: true },
  { value: "lte", label: "קטן או שווה", needsValue: true },
  { value: "between", label: "בין", needsValue: true, isBetween: true },
  { value: "is_empty", label: "ריק", needsValue: false },
  { value: "is_not_empty", label: "לא ריק", needsValue: false },
  { value: "in_list", label: "ברשימה", needsValue: true },
];

export default function DynamicDataView() {
  const { entityId } = useParams<{ entityId: string }>();
  const eId = Number(entityId);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { permissions, canAccessEntity, canCreateInModule, canEditInModule, canDeleteInModule } = usePermissions();
  const initialSearch = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  }, []);
  const [search, setSearch] = useState(initialSearch);
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
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkFieldUpdate, setBulkFieldUpdate] = useState<{ field: string; value: any } | null>(null);
  const [viewTypeOverride, setViewTypeOverride] = useState<string | null>(null);
  const pageSize = 25;

  const { data: entity } = useQuery({
    queryKey: ["platform-entity", eId],
    queryFn: () => authFetch(`${API}/platform/entities/${eId}`).then(r => r.json()),
  });

  const { modules: allModules } = usePlatformModules();

  const { data: views = [] } = useQuery({
    queryKey: ["entity-views", eId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${eId}/views`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!entity,
  });

  const { data: forms = [] } = useQuery({
    queryKey: ["entity-forms", eId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${eId}/forms`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!entity,
  });

  const { data: detailDefs = [] } = useQuery({
    queryKey: ["entity-details", eId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/entities/${eId}/details`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
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

  const activeView = useMemo(() => {
    if (activeViewId) return views.find((v: any) => v.id === activeViewId) || null;
    return views.find((v: any) => v.isDefault) || null;
  }, [views, activeViewId]);

  const effectiveSortBy = useMemo(() => {
    if (sortBy) return sortBy;
    if (activeView?.sorting && Array.isArray(activeView.sorting) && activeView.sorting.length > 0) {
      return activeView.sorting[0].fieldSlug;
    }
    return "";
  }, [sortBy, activeView]);

  const effectiveSortDir = useMemo(() => {
    if (sortBy) return sortDir;
    if (activeView?.sorting && Array.isArray(activeView.sorting) && activeView.sorting.length > 0) {
      return activeView.sorting[0].direction || "asc";
    }
    return "desc";
  }, [sortBy, sortDir, activeView]);

  const activeFiltersParam = useMemo(() => {
    const validFilters = filterRows.filter(f => f.field && f.operator);
    if (validFilters.length === 0) return undefined;
    return JSON.stringify({
      filters: validFilters.map(f => ({ field: f.field, operator: f.operator, value: f.value })),
      combinator: filterCombinator,
    });
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
      method: "POST", body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => authFetch(`${API}/platform/records/${id}`, {
      method: "PUT", body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }); setEditRecord(null); },
  });

  const autoSaveMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => authFetch(`${API}/platform/records/${id}`, {
      method: "PUT", body: JSON.stringify(data),
    }).then(r => { if (!r.ok) throw new Error("Auto-save failed"); return r.json(); }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/records/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: { ids: number[]; data?: any; status?: string }) =>
      authFetch(`${API}/platform/records/bulk/update`, {
        method: "PUT", body: JSON.stringify({ ...payload, entityId: eId }),
      }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }); setSelectedRows(new Set()); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      authFetch(`${API}/platform/records/bulk/delete`, {
        method: "DELETE", body: JSON.stringify({ ids, entityId: eId }),
      }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-records", eId] }); setSelectedRows(new Set()); },
  });

  const fields = entity?.fields || [];
  const statuses = entity?.statuses || [];
  const rawRecords = recordsData?.records || [];
  const total = recordsData?.total || 0;

  const records = useMemo(() => {
    if (!activeView?.filters || !Array.isArray(activeView.filters) || activeView.filters.length === 0) return rawRecords;
    return rawRecords.filter((rec: any) => {
      const data = rec.data || {};
      return activeView.filters.every((filter: any) => {
        const val = String(data[filter.fieldSlug] ?? "");
        const filterVal = String(filter.value ?? "");
        switch (filter.operator) {
          case "equals": return val === filterVal;
          case "not_equals": return val !== filterVal;
          case "contains": return val.toLowerCase().includes(filterVal.toLowerCase());
          case "not_contains": return !val.toLowerCase().includes(filterVal.toLowerCase());
          case "starts_with": return val.toLowerCase().startsWith(filterVal.toLowerCase());
          case "gt": return Number(val) > Number(filterVal);
          case "lt": return Number(val) < Number(filterVal);
          case "gte": return Number(val) >= Number(filterVal);
          case "lte": return Number(val) <= Number(filterVal);
          case "between": {
            const bounds = Array.isArray(filter.value) ? filter.value : [0, 0];
            const minStr = String(bounds[0] ?? "");
            const maxStr = String(bounds[1] ?? "");
            const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(minStr) || /^\d{4}-\d{2}-\d{2}/.test(maxStr);
            if (looksLikeDate) {
              return val >= minStr && val <= maxStr;
            }
            const num = Number(val);
            return num >= Number(bounds[0]) && num <= Number(bounds[1]);
          }
          case "is_empty": return !val || val === "undefined" || val === "null";
          case "is_not_empty": return !!val && val !== "undefined" && val !== "null";
          case "in_list": {
            const list = Array.isArray(filter.value) ? filter.value.map(String) : String(filter.value ?? "").split(",").map(s => s.trim());
            return list.includes(val);
          }
          default: return true;
        }
      });
    });
  }, [rawRecords, activeView]);

  const totalPages = Math.ceil(total / pageSize);

  const isDevMode = permissions.roles.includes("__dev__");
  const parentModule = entity?.moduleId ? allModules.find((m: any) => m.id === entity.moduleId) : null;
  const moduleSlug = parentModule?.slug || "";
  const canCreate = permissions.isSuperAdmin || isDevMode || canAccessEntity(eId, "create") || (moduleSlug && canCreateInModule(moduleSlug));
  const canEdit = permissions.isSuperAdmin || isDevMode || canAccessEntity(eId, "update") || (moduleSlug && canEditInModule(moduleSlug));
  const canDelete = permissions.isSuperAdmin === true;

  const listFields = useMemo(() => {
    if (activeView?.columns && Array.isArray(activeView.columns) && activeView.columns.length > 0) {
      return activeView.columns
        .filter((c: any) => c.visible !== false)
        .map((c: any) => fields.find((f: any) => f.slug === c.fieldSlug))
        .filter(Boolean);
    }
    return fields.filter((f: any) => f.showInList);
  }, [fields, activeView]);

  const getFormForMode = (mode: "create" | "edit") => {
    const typeMatch = forms.find((f: any) => f.formType === mode && f.isDefault);
    if (typeMatch) return typeMatch;
    const typeOnly = forms.find((f: any) => f.formType === mode);
    if (typeOnly) return typeOnly;
    const defaultF = forms.find((f: any) => f.isDefault);
    if (defaultF) return defaultF;
    return forms[0] || null;
  };

  const defaultDetail = useMemo(() => {
    return detailDefs.find((d: any) => d.isDefault) || detailDefs[0] || null;
  }, [detailDefs]);

  const handleSort = (slug: string) => {
    if (sortBy === slug) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(slug);
      setSortDir("asc");
    }
  };

  const rowActions = actions.filter((a: any) =>
    ["row", "contextual"].includes(a.actionType) && a.isActive &&
    (a.handlerType !== "delete" || canDelete)
  );

  const executeAction = async (action: any, record: any) => {
    const config = action.handlerConfig || {};
    switch (action.handlerType) {
      case "status_change":
        if (record && config.targetStatus) {
          await updateMutation.mutateAsync({ id: record.id, status: config.targetStatus });
        }
        break;
      case "duplicate":
        if (record) {
          await createMutation.mutateAsync({ data: record.data, status: record.status });
        }
        break;
      case "navigate":
        if (config.url) {
          setLocation(config.url);
        }
        break;
      case "delete":
        if (record && canDelete) {
          const ok = await globalConfirm("מחיקת רשומה", { itemName: `#${record.id}`, entityType: "רשומה" });
          if (ok) deleteMutation.mutate(record.id);
        }
        break;
      case "create":
        setShowForm(true);
        break;
      default:
        break;
    }
  };

  const addFilterRow = () => {
    setFilterRows(prev => [...prev, { id: crypto.randomUUID(), field: "", operator: "equals", value: "" }]);
  };

  const updateFilterRow = (id: string, updates: Partial<FilterRow>) => {
    setFilterRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const removeFilterRow = (id: string) => {
    setFilterRows(prev => prev.filter(r => r.id !== id));
  };

  const clearAllFilters = () => {
    setFilterRows([]);
    setPage(0);
  };

  const toggleSelectRow = (id: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === records.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(records.map((r: any) => r.id)));
    }
  };

  const escHtml = (val: any): string => {
    const s = String(val ?? "");
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  const handleExport = async (format: "csv" | "excel" | "pdf" | "json") => {
    let printWindow: Window | null = null;
    if (format === "pdf") {
      printWindow = window.open("", "_blank");
      if (!printWindow) { alert("אנא אפשר חלונות קופצים כדי לייצא PDF"); return; }
      printWindow.document.write('<html dir="rtl"><head><meta charset="utf-8"/></head><body><p style="font-family:Arial;text-align:center;margin-top:40px">טוען נתונים...</p></body></html>');
    }
    try {
      const apiFormat = format === "excel" || format === "pdf" ? "json" : format;
      const params = new URLSearchParams({ format: apiFormat });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      if (sortBy) { params.set("sortBy", sortBy); params.set("sortDir", sortDir); }
      const res = await authFetch(`${API}/platform/entities/${eId}/records/export?${params}`);
      if (!res.ok) { if (printWindow) printWindow.close(); alert("שגיאה בייצוא"); return; }

      if (format === "csv" || format === "json") {
        const text = await res.text();
        const mime = format === "csv" ? "text/csv;charset=utf-8;" : "application/json;charset=utf-8;";
        const blob = new Blob([text], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${entity?.name || "export"}_${new Date().toISOString().split("T")[0]}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      const jsonData = await res.json();
      const arr = Array.isArray(jsonData) ? jsonData : [];
      if (arr.length === 0) { if (printWindow) printWindow.close(); alert("אין נתונים לייצוא"); return; }

      const allFields = (fields || []) as any[];
      const headerMap: Record<string, string> = {};
      allFields.forEach((f: any) => { headerMap[f.slug] = f.name; });
      if (Object.keys(headerMap).length === 0) {
        Object.keys(arr[0]).filter(k => !k.startsWith("_")).forEach(k => { headerMap[k] = k; });
      }

      const headerKeys = Object.keys(headerMap);
      const headerLabels = Object.values(headerMap);
      const exportData = arr.map((row: any) => {
        const clean: Record<string, any> = {};
        headerKeys.forEach(k => { clean[k] = row[k] ?? ""; });
        return clean;
      });

      if (format === "excel") {
        const excelDate = new Date().toLocaleDateString('he-IL');
        let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body><table dir="rtl">';
        html += `<tr><td colspan="${headerLabels.length}" style="background:#1e40af;color:white;font-size:16px;font-weight:bold;padding:12px;text-align:right">טכנו-כל עוזי | TECHNO-KOL UZI</td></tr>`;
        html += `<tr><td colspan="${headerLabels.length}" style="background:#1e3a5f;color:#93c5fd;font-size:11px;padding:6px;text-align:right">ח.פ 054227129 | ${escHtml(entity?.namePlural || entity?.name || "דוח")} | ${excelDate} | סה"כ: ${exportData.length} רשומות</td></tr>`;
        html += '<tr><td colspan="' + headerLabels.length + '" style="height:4px"></td></tr>';
        html += '<thead><tr>';
        headerLabels.forEach(label => { html += `<th style="background:#1e40af;color:white;font-weight:bold;padding:8px;border:1px solid #ddd;text-align:right">${escHtml(label)}</th>`; });
        html += '</tr></thead><tbody>';
        exportData.forEach((row, i) => {
          html += `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">`;
          headerKeys.forEach(key => { html += `<td style="padding:6px;border:1px solid #e2e8f0">${escHtml(row[key])}</td>`; });
          html += '</tr>';
        });
        html += '</tbody></table></body></html>';
        const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${entity?.name || "export"}_${new Date().toISOString().split("T")[0]}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (format === "pdf" && printWindow) {
        const titleText = escHtml(entity?.namePlural || entity?.name || "דוח");
        const dateText = escHtml(new Date().toLocaleDateString('he-IL'));
        const timeText = escHtml(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
        printWindow.document.open();
        printWindow.document.write(`
          <html dir="rtl"><head><meta charset="utf-8"/><title>${titleText}</title>
          <style>
            @page { size: A4 landscape; margin: 15mm; }
            body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; color: #1e293b; }
            .pdf-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e40af; padding-bottom: 12px; margin-bottom: 20px; }
            .pdf-logo { display: flex; align-items: center; gap: 12px; }
            .pdf-logo-icon { width: 44px; height: 44px; background: linear-gradient(135deg, #1e40af, #3b82f6); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px; letter-spacing: 1px; }
            .pdf-company { font-size: 18px; font-weight: bold; color: #1e40af; }
            .pdf-company-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
            .pdf-title-section {}
            .pdf-title { font-size: 20px; font-weight: bold; color: #0f172a; }
            .pdf-meta { font-size: 10px; color: #64748b; margin-top: 4px; }
            .pdf-count { font-size: 11px; color: #475569; margin-bottom: 12px; background: #f1f5f9; display: inline-block; padding: 4px 12px; border-radius: 6px; }
            table { border-collapse: collapse; width: 100%; font-size: 11px; }
            th { background: #1e40af; color: white; padding: 8px 10px; text-align: right; font-size: 10px; font-weight: 600; }
            td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; }
            tr:nth-child(even) { background: #f8fafc; }
            .pdf-footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 10px; } }
          </style></head><body>
          <div class="pdf-header">
            <div class="pdf-title-section">
              <div class="pdf-title">${titleText}</div>
              <div class="pdf-meta">${dateText} | ${timeText}</div>
            </div>
            <div class="pdf-logo">
              <div>
                <div class="pdf-company">טכנו-כל עוזי</div>
                <div class="pdf-company-sub">TECHNO-KOL UZI | ח.פ 054227129</div>
              </div>
              <div class="pdf-logo-icon">TK</div>
            </div>
          </div>
          <div class="pdf-count">סה"כ: ${exportData.length} רשומות</div>
          <table><thead><tr>${headerLabels.map(l => `<th>${escHtml(l)}</th>`).join('')}</tr></thead>
          <tbody>${exportData.map((row, i) => `<tr>${headerKeys.map(k => `<td>${escHtml(row[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>
          <div class="pdf-footer">
            <span>TECHNO-KOL UZI | ERP System</span>
            <span>${new Date().toISOString()}</span>
          </div>
          </body></html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow!.print(); }, 500);
      }
    } catch (err) {
      if (printWindow) printWindow.close();
      alert("שגיאה בייצוא: " + (err instanceof Error ? err.message : ""));
    }
  };

  const handleBulkDelete = async () => {
    const ok = await globalConfirm("מחיקה מרובה", { itemName: `${selectedRows.size} רשומות`, entityType: "רשומות" });
    if (ok) {
      bulkDeleteMutation.mutate(Array.from(selectedRows));
    }
  };

  const handleBulkStatusUpdate = (newStatus: string) => {
    bulkUpdateMutation.mutate({ ids: Array.from(selectedRows), status: newStatus });
    setShowBulkStatusModal(false);
  };

  const handleBulkFieldUpdate = () => {
    if (bulkFieldUpdate && bulkFieldUpdate.field) {
      bulkUpdateMutation.mutate({
        ids: Array.from(selectedRows),
        data: { [bulkFieldUpdate.field]: bulkFieldUpdate.value },
      });
      setBulkFieldUpdate(null);
    }
  };

  if (!entity) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  // מיפוי היישויות לקטגוריות בתפריט
  const getEntitySection = (slug: string): string => {
    const entitySectionMap: Record<string, string> = {
      // רכש ומלאי
      "raw_materials": "רכש ומלאי",
      "raw-material-procurement": "רכש ומלאי", 
      "raw-material-inventory": "רכש ומלאי",
      "product": "רכש ומלאי",
      "finished-product": "רכש ומלאי",
      "warehouse": "רכש ומלאי",
      "inventory-transaction": "רכש ומלאי",
      "price-history": "רכש ומלאי",
      
      // לקוחות ומכירות
      "customer": "לקוחות ומכירות",
      "quote": "לקוחות ומכירות",
      "sales-order": "לקוחות ומכירות",
      "invoice": "לקוחות ומכירות",
      "contact-person": "לקוחות ומכירות",
      "crm-activity": "לקוחות ומכירות",
      "delivery-note": "לקוחות ומכירות",
      "sales-return": "לקוחות ומכירות",
    };
    return entitySectionMap[slug] || "כללי";
  };

  const activeFilterCount = filterRows.filter(f => f.field && f.operator).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="hover:text-foreground transition-colors">{getEntitySection(entity.slug)}</span>
        <span>/</span>
        <Link href={`/builder/entity/${eId}`} className="hover:text-foreground transition-colors">{entity.name}</Link>
        <span>/</span>
        <span className="text-foreground">נתונים</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">{entity.namePlural}</h1>
          <p className="text-muted-foreground mt-1">{total} רשומות</p>
        </div>
        <div className="flex items-center gap-2">
          {actions.filter((a: any) => ["page", "header"].includes(a.actionType) && a.isActive).map((action: any) => {
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
          <button onClick={() => setShowImportWizard(true)} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-xl text-sm hover:bg-muted/80 transition-colors">
            <Upload className="w-4 h-4" />
            ייבוא CSV
          </button>
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-2 bg-muted rounded-xl text-sm hover:bg-muted/80 transition-colors">
              <Download className="w-4 h-4" />
              ייצוא
              <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[160px]">
              <button onClick={() => handleExport("csv")} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-muted/50 rounded-t-xl transition-colors">
                CSV ייצוא
              </button>
              <button onClick={() => handleExport("excel")} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors">
                Excel ייצוא
              </button>
              <button onClick={() => handleExport("pdf")} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors">
                PDF ייצוא
              </button>
              <button onClick={() => handleExport("json")} className="block w-full text-right px-4 py-2.5 text-sm hover:bg-muted/50 rounded-b-xl transition-colors">
                JSON ייצוא
              </button>
            </div>
          </div>
          {canCreate && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-5 h-5" />
              {entity.name} חדש
            </button>
          )}
        </div>
      </div>

      {selectedRows.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <CheckSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{selectedRows.size} רשומות נבחרו</span>
          <div className="flex items-center gap-2 mr-4">
            {canEdit && statuses.length > 0 && (
              <button onClick={() => setShowBulkStatusModal(true)}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
                שנה סטטוס
              </button>
            )}
            {canEdit && (
              <button onClick={() => setBulkFieldUpdate({ field: "", value: "" })}
                className="px-3 py-1.5 bg-blue-600 text-foreground rounded-lg text-xs font-medium hover:bg-blue-700">
                עדכן שדה
              </button>
            )}
            {actions.filter((a: any) => a.actionType === "bulk" && a.isActive && (a.handlerType !== "delete" || canDelete)).map((action: any) => (
              <button key={action.id} onClick={() => { selectedRows.forEach(id => executeAction(action, records.find((r: any) => r.id === id))); setSelectedRows(new Set()); }}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium">{action.name}</button>
            ))}
            {canDelete && (
              <button onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-xs font-medium hover:bg-destructive/90">
                מחק נבחרים
              </button>
            )}
          </div>
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
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 bg-primary text-primary-foreground rounded-md text-xs">{activeFilterCount}</span>
          )}
        </button>
        {views.length > 0 && (
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
            <Table2 className="w-4 h-4 text-muted-foreground mr-1 ml-2" />
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
              <button key={vt.type} onClick={() => setViewTypeOverride(vt.type)}
                title={vt.label}
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

      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">סינון מתקדם</h3>
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                    <button onClick={() => setFilterCombinator("and")}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${filterCombinator === "and" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                      AND - כל התנאים
                    </button>
                    <button onClick={() => setFilterCombinator("or")}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${filterCombinator === "or" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                      OR - אחד מהתנאים
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {filterRows.length > 0 && (
                    <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground">
                      נקה הכל
                    </button>
                  )}
                  <button onClick={() => setShowFilters(false)} className="p-1 hover:bg-muted rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {filterRows.map((row, idx) => (
                <div key={row.id} className="flex items-center gap-2">
                  {idx > 0 && (
                    <span className="text-xs text-muted-foreground w-10 text-center flex-shrink-0">
                      {filterCombinator === "and" ? "וגם" : "או"}
                    </span>
                  )}
                  {idx === 0 && <span className="w-10 flex-shrink-0" />}
                  <select value={row.field} onChange={e => updateFilterRow(row.id, { field: e.target.value })}
                    className="flex-1 max-w-[200px] px-2 py-2 bg-background border border-border rounded-lg text-sm">
                    <option value="">בחר שדה...</option>
                    {fields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                  </select>
                  <select value={row.operator} onChange={e => updateFilterRow(row.id, { operator: e.target.value })}
                    className="flex-1 max-w-[180px] px-2 py-2 bg-background border border-border rounded-lg text-sm">
                    {FILTER_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  {FILTER_OPERATORS.find(op => op.value === row.operator)?.needsValue !== false && (
                    (FILTER_OPERATORS.find(op => op.value === row.operator) as any)?.isBetween ? (
                      <div className="flex items-center gap-1 flex-1 max-w-[200px]">
                        <input value={Array.isArray(row.value) ? row.value[0] ?? "" : ""}
                          onChange={e => updateFilterRow(row.id, { value: [e.target.value, Array.isArray(row.value) ? row.value[1] ?? "" : ""] })}
                          placeholder="מ..."
                          className="flex-1 px-2 py-2 bg-background border border-border rounded-lg text-sm" />
                        <span className="text-xs text-muted-foreground">-</span>
                        <input value={Array.isArray(row.value) ? row.value[1] ?? "" : ""}
                          onChange={e => updateFilterRow(row.id, { value: [Array.isArray(row.value) ? row.value[0] ?? "" : "", e.target.value] })}
                          placeholder="עד..."
                          className="flex-1 px-2 py-2 bg-background border border-border rounded-lg text-sm" />
                      </div>
                    ) : (
                      <input value={row.value ?? ""} onChange={e => updateFilterRow(row.id, { value: e.target.value })}
                        placeholder="ערך..."
                        className="flex-1 max-w-[200px] px-2 py-2 bg-background border border-border rounded-lg text-sm" />
                    )
                  )}
                  <button onClick={() => removeFilterRow(row.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              ))}

              <button onClick={addFilterRow} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium">
                <Plus className="w-3.5 h-3.5" />
                הוסף תנאי
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(() => {
        const currentViewType = viewTypeOverride || activeView?.viewType || "table";
        if (loadingRecords) {
          return (
            <div className="bg-card border border-border rounded-2xl p-6">
              <LoadingSkeleton variant="table" rows={5} />
            </div>
          );
        }
        if (records.length === 0) {
          return (
            <div className="bg-card border border-border rounded-2xl">
              <EmptyState
                variant={search || activeFilterCount > 0 ? "search" : "default"}
                title={search || activeFilterCount > 0 ? "לא נמצאו תוצאות" : "אין רשומות עדיין"}
                description={search || activeFilterCount > 0 ? "נסה לשנות את הסינון או החיפוש" : "צור את הרשומה הראשונה כדי להתחיל"}
                action={!search && activeFilterCount === 0 && canEdit ? { label: "צור רשומה", onClick: () => setShowForm(true) } : undefined}
              />
            </div>
          );
        }
        if (currentViewType === "kanban") {
          return <KanbanView records={records} fields={fields} statuses={statuses} entity={entity} activeView={activeView} entityId={eId} onViewRecord={setViewRecord} onEditRecord={setEditRecord} canEdit={canEdit} />;
        }
        if (currentViewType === "calendar") {
          return <CalendarView records={records} fields={fields} statuses={statuses} entity={entity} activeView={activeView} entityId={eId} onViewRecord={setViewRecord} onEditRecord={setEditRecord} canEdit={canEdit} />;
        }
        if (currentViewType === "cards" || currentViewType === "summary") {
          return <SummaryCardsView records={records} fields={fields} statuses={statuses} entity={entity} activeView={activeView} entityId={eId} onViewRecord={setViewRecord} onEditRecord={setEditRecord} onDeleteRecord={(id) => deleteMutation.mutate(id)} canEdit={canEdit} canDelete={canDelete} />;
        }
        return (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-center px-3 py-3 w-10">
                      <input type="checkbox" checked={records.length > 0 && selectedRows.size === records.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer" />
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground w-12">#</th>
                    {listFields.map((f: any) => (
                      <th key={f.slug}
                        className={`text-right px-4 py-3 text-xs font-medium transition-colors group ${f.isSortable ? "cursor-pointer select-none" : ""} ${effectiveSortBy === f.slug ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => f.isSortable && handleSort(f.slug)}>
                        <div className="flex items-center gap-1">
                          {f.name}
                          {effectiveSortBy === f.slug
                            ? (effectiveSortDir === "asc" ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />)
                            : f.isSortable && <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                          }
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
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(rec.id)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer" />
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
                            {canEdit && <button onClick={() => setEditRecord(rec)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>}
                            {rowActions.map((action: any) => (
                              <button key={action.id} onClick={() => executeAction(action, rec)} className="p-1.5 hover:bg-muted rounded-lg" title={action.name}>
                                <Zap className="w-3.5 h-3.5 text-primary" />
                              </button>
                            ))}
                            {canDelete && <button onClick={async () => { const ok = await globalConfirm("מחיקת רשומה", { itemName: `#${rec.id}`, entityType: "רשומה" }); if (ok) deleteMutation.mutate(rec.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>}
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
          <DynamicFormModal
            fields={fields.filter((f: any) => f.showInForm)}
            statuses={statuses}
            record={editRecord}
            entityName={entity.name}
            formDefinition={getFormForMode(editRecord ? "edit" : "create")}
            validationRules={validationRules}
            allFields={fields}
            transitions={transitions}
            relations={relations}
            entityId={eId}
            readOnly={editRecord ? !canEdit : false}
            onClose={() => { setShowForm(false); setEditRecord(null); }}
            onSubmit={(data) => {
              if (editRecord) {
                updateMutation.mutate({ id: editRecord.id, ...data });
              } else {
                createMutation.mutate(data);
              }
            }}
            onAutoSave={editRecord ? async (data) => {
              await autoSaveMutation.mutateAsync({ id: editRecord.id, ...data });
            } : undefined}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
        {viewRecord && (
          <RecordDetailModal
            record={viewRecord}
            fields={fields}
            statuses={statuses}
            entityName={entity.name}
            entityId={eId}
            detailDefinition={defaultDetail}
            relations={relations}
            actions={actions}
            onClose={() => setViewRecord(null)}
            onEdit={canEdit ? () => { setEditRecord(viewRecord); setViewRecord(null); } : undefined}
            onExecuteAction={(action: any) => executeAction(action, viewRecord)}
          />
        )}
        {showImportWizard && (
          <ImportWizardModal
            entityId={eId}
            fields={fields}
            statuses={statuses}
            onClose={() => setShowImportWizard(false)}
            onComplete={() => {
              setShowImportWizard(false);
              queryClient.invalidateQueries({ queryKey: ["entity-records", eId] });
            }}
          />
        )}
        {showBulkStatusModal && (
          <BulkStatusModal
            statuses={statuses}
            count={selectedRows.size}
            onClose={() => setShowBulkStatusModal(false)}
            onSelect={handleBulkStatusUpdate}
          />
        )}
        {bulkFieldUpdate && (
          <BulkFieldUpdateModal
            fields={fields}
            count={selectedRows.size}
            value={bulkFieldUpdate}
            onChange={setBulkFieldUpdate}
            onClose={() => setBulkFieldUpdate(null)}
            onConfirm={handleBulkFieldUpdate}
            isLoading={bulkUpdateMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BulkStatusModal({ statuses, count, onClose, onSelect }: {
  statuses: any[]; count: number; onClose: () => void; onSelect: (status: string) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-2">שנה סטטוס</h3>
        <p className="text-sm text-muted-foreground mb-4">{count} רשומות נבחרו</p>
        <div className="space-y-2">
          {statuses.map((s: any) => {
            const colorDef = STATUS_COLORS.find(c => c.key === s.color);
            return (
              <button key={s.slug} onClick={() => onSelect(s.slug)}
                className="w-full text-right px-4 py-2.5 rounded-xl border border-border hover:border-primary/30 transition-colors flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colorDef?.hex || "#6b7280" }} />
                <span className="text-sm font-medium">{s.name}</span>
              </button>
            );
          })}
        </div>
        <button onClick={onClose} className="w-full mt-4 px-4 py-2 bg-muted rounded-xl text-sm font-medium">ביטול</button>
      </motion.div>
    </motion.div>
  );
}

function BulkFieldUpdateModal({ fields, count, value, onChange, onClose, onConfirm, isLoading }: {
  fields: any[]; count: number; value: { field: string; value: any };
  onChange: (v: { field: string; value: any }) => void;
  onClose: () => void; onConfirm: () => void; isLoading: boolean;
}) {
  const editableFields = fields.filter((f: any) =>
    !f.isReadOnly && f.fieldType !== "auto_number" && f.fieldType !== "formula" && f.fieldType !== "computed"
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-2">עדכון שדה מרובה</h3>
        <p className="text-sm text-muted-foreground mb-4">{count} רשומות נבחרו</p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">שדה</label>
            <select value={value.field} onChange={e => onChange({ ...value, field: e.target.value })}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm">
              <option value="">בחר שדה...</option>
              {editableFields.map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">ערך חדש</label>
            <input value={value.value ?? ""} onChange={e => onChange({ ...value, value: e.target.value })}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm" placeholder="הזן ערך..." />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6">
          <button onClick={onConfirm} disabled={!value.field || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "מעדכן..." : "עדכן"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ImportWizardModal({ entityId, fields, statuses, onClose, onComplete }: {
  entityId: number; fields: any[]; statuses: any[]; onClose: () => void; onComplete: () => void;
}) {
  const [step, setStep] = useState<"upload" | "mapping" | "importing" | "results">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importStatus, setImportStatus] = useState<string>("draft");
  const [results, setResults] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError("");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await authFetch(`${API}/platform/entities/${entityId}/records/import/preview`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to preview file");
        return;
      }
      setPreview(data);
      setMapping(data.autoMapping || {});
      setStep("mapping");
    } catch (err: any) {
      setError(err.message || "Failed to upload file");
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setIsImporting(true);
    setStep("importing");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));
    formData.append("status", importStatus);

    try {
      const res = await authFetch(`${API}/platform/entities/${entityId}/records/import`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResults(data);
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Import failed");
      setStep("mapping");
    } finally {
      setIsImporting(false);
    }
  };

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">ייבוא נתונים מ-CSV</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {["upload", "mapping", "importing", "results"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? "bg-primary text-primary-foreground" :
                ["upload", "mapping", "importing", "results"].indexOf(step) > i ? "bg-green-500 text-foreground" :
                "bg-muted text-muted-foreground"
              }`}>
                {["upload", "mapping", "importing", "results"].indexOf(step) > i ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < 3 && <div className="w-8 h-0.5 bg-border" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === "upload" && (
          <div className="text-center py-8">
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden" />
            <div onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-2xl p-12 cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">גרור קובץ CSV או לחץ לבחירה</p>
              <p className="text-xs text-muted-foreground">עד 10MB, פורמט CSV עם שורת כותרת</p>
            </div>
          </div>
        )}

        {step === "mapping" && preview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{preview.totalRows} שורות נמצאו בקובץ · {mappedCount} עמודות ממופות</p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">מיפוי עמודות</h3>
              <div className="bg-background border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">עמודה ב-CSV</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">ממופה לשדה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.headers.map((header: string, idx: number) => (
                      <tr key={idx} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">{header}</td>
                        <td className="px-3 py-2">
                          <select value={mapping[idx] || ""} onChange={e => setMapping(prev => ({ ...prev, [idx]: e.target.value }))}
                            className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm">
                            <option value="">דלג על עמודה</option>
                            {fields.filter(f => f.fieldType !== "auto_number" && f.fieldType !== "formula" && f.fieldType !== "computed")
                              .map((f: any) => <option key={f.slug} value={f.slug}>{f.name} ({f.slug})</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {preview.previewRows && preview.previewRows.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">תצוגה מקדימה</h3>
                <div className="bg-background border border-border rounded-xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {preview.headers.map((h: string, i: number) => (
                          <th key={i} className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.slice(0, 3).map((row: string[], rIdx: number) => (
                        <tr key={rIdx} className="border-b border-border/50 last:border-0">
                          {row.map((cell: string, cIdx: number) => (
                            <td key={cIdx} className="px-2 py-1.5 whitespace-nowrap max-w-[150px] truncate">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {statuses.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1.5">סטטוס ברירת מחדל לרשומות מיובאות</label>
                <select value={importStatus} onChange={e => setImportStatus(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-xl text-sm">
                  <option value="draft">טיוטה</option>
                  {statuses.map((s: any) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button onClick={handleImport} disabled={mappedCount === 0}
                className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
                ייבא {preview.totalRows} שורות
              </button>
              <button onClick={() => { setStep("upload"); setPreview(null); setFile(null); }}
                className="px-4 py-2.5 bg-muted rounded-xl font-medium">חזור</button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-12 text-center">
            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium">מייבא נתונים...</p>
            <p className="text-xs text-muted-foreground mt-1">אנא המתן</p>
          </div>
        )}

        {step === "results" && results && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                <p className="text-lg sm:text-2xl font-bold text-green-500">{results.imported}</p>
                <p className="text-xs text-muted-foreground mt-1">יובאו בהצלחה</p>
              </div>
              <div className={`border rounded-xl p-4 text-center ${results.failed > 0 ? "bg-destructive/10 border-destructive/20" : "bg-muted border-border"}`}>
                <p className={`text-lg sm:text-2xl font-bold ${results.failed > 0 ? "text-destructive" : "text-muted-foreground"}`}>{results.failed}</p>
                <p className="text-xs text-muted-foreground mt-1">נכשלו</p>
              </div>
              <div className="bg-muted border border-border rounded-xl p-4 text-center">
                <p className="text-lg sm:text-2xl font-bold">{results.total}</p>
                <p className="text-xs text-muted-foreground mt-1">סה"כ שורות</p>
              </div>
            </div>

            {results.errors && results.errors.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-destructive">שגיאות</h3>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {results.errors.slice(0, 20).map((err: any, i: number) => (
                    <div key={i} className="px-3 py-2 bg-destructive/5 border border-destructive/10 rounded-lg text-xs">
                      <span className="font-medium">שורה {err.row}:</span>{" "}
                      {err.error || Object.entries(err.errors || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}
                    </div>
                  ))}
                  {results.errors.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center py-1">+{results.errors.length - 20} שגיאות נוספות</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button onClick={onComplete}
                className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium">
                סיום
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

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
  if (type === "formula" || type === "computed") {
    if (value === null || value === undefined || value === "") {
      return <span className="text-muted-foreground text-xs">-</span>;
    }
    return <span className="font-mono text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">{typeof value === "number" ? value.toLocaleString() : String(value)}</span>;
  }
  if (type === "auto_number") {
    return <span className="font-mono text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">{String(value)}</span>;
  }
  if (type === "sub_table") {
    const arr = Array.isArray(value) ? value : [];
    return <span className="text-xs text-muted-foreground">{arr.length} שורות</span>;
  }
  const enhanced = renderCellValueEnhanced(value, field);
  if (enhanced !== null) return enhanced;
  if (type === "duration") {
    const mins = Number(value);
    if (isNaN(mins)) return String(value);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return <span className="font-mono text-xs">{h > 0 ? `${h}ש ${m}ד` : `${m}ד`}</span>;
  }
  if (type === "user_reference") {
    if (typeof value === "object" && value) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
            {(value.name || value.email || "?").charAt(0).toUpperCase()}
          </span>
          <span className="text-xs">{value.name || value.email || `#${value.id}`}</span>
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">{String(value)}</span>;
  }
  if (type === "signature") {
    if (typeof value === "string" && value.startsWith("data:image")) {
      return <img src={value} alt="חתימה" className="h-8 w-auto border border-border rounded" />;
    }
    return <span className="text-xs text-green-400">חתום</span>;
  }
  if (type === "address") {
    if (typeof value === "object" && value) {
      const parts = [value.street, value.city, value.zip].filter(Boolean);
      return <span className="text-xs">{parts.join(", ") || "-"}</span>;
    }
    return String(value);
  }
  if (type === "barcode") {
    const v = String(value);
    return (
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 40 16" className="h-4 w-8" preserveAspectRatio="none">
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x={i * 3 + (i % 2 === 0 ? 0 : 1)} y={0} width={i % 3 === 0 ? 2 : 1} height={16} fill="currentColor" />
          ))}
        </svg>
        <span className="font-mono text-xs">{v.length > 20 ? v.slice(0, 20) + "…" : v}</span>
      </span>
    );
  }
  if (type === "qr") {
    const v = String(value);
    return (
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 7 7" className="h-4 w-4">
          <rect x={0} y={0} width={3} height={3} fill="currentColor" /><rect x={4} y={0} width={3} height={3} fill="currentColor" />
          <rect x={0} y={4} width={3} height={3} fill="currentColor" /><rect x={5} y={5} width={2} height={2} fill="currentColor" />
          <rect x={4} y={3} width={1} height={1} fill="currentColor" /><rect x={3} y={4} width={1} height={1} fill="currentColor" />
        </svg>
        <span className="font-mono text-xs">{v.length > 20 ? v.slice(0, 20) + "…" : v}</span>
      </span>
    );
  }
  if (type === "rich_text") {
    const text = String(value).replace(/<[^>]*>/g, "");
    return <span className="text-xs">{text.length > 60 ? text.slice(0, 60) + "..." : text}</span>;
  }
  if (typeof value === "object" && value !== null) {
    const display = value.name || value.label || value.title || value.value || value.email || value.slug;
    if (display) return String(display);
    return JSON.stringify(value).slice(0, 60);
  }
  if (typeof value === "string" && value.length > 60) return value.slice(0, 60) + "...";
  return String(value);
}

interface ClientToken {
  type: string;
  value?: any;
}

type ClientASTNode =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "field_ref"; slug: string }
  | { kind: "binary"; op: string; left: ClientASTNode; right: ClientASTNode }
  | { kind: "unary"; op: string; operand: ClientASTNode }
  | { kind: "call"; name: string; args: ClientASTNode[] }
  | { kind: "ident"; value: string };

function clientTokenize(expression: string): ClientToken[] {
  const tokens: ClientToken[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "{") {
      const end = expression.indexOf("}", i);
      if (end === -1) throw new Error("Unclosed {");
      tokens.push({ type: "field_ref", value: expression.slice(i + 1, end) });
      i = end + 1; continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch; let s = ""; i++;
      while (i < expression.length && expression[i] !== q) { s += expression[i]; i++; }
      if (i < expression.length) i++;
      tokens.push({ type: "string", value: s }); continue;
    }
    if (ch === ">" || ch === "<" || ch === "!" || ch === "=") {
      let op = ch;
      if (i + 1 < expression.length && expression[i + 1] === "=") { op += "="; i++; }
      tokens.push({ type: "comparison", value: op }); i++; continue;
    }
    if (/[+\-*/%^]/.test(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    if (ch === "(") { tokens.push({ type: "paren", value: "(" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "paren", value: ")" }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma" }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let n = "";
      while (i < expression.length && /[0-9.]/.test(expression[i])) { n += expression[i]; i++; }
      tokens.push({ type: "number", value: parseFloat(n) }); continue;
    }
    if (/[a-zA-Z_\u0590-\u05FF]/.test(ch)) {
      let id = "";
      while (i < expression.length && /[a-zA-Z0-9_\u0590-\u05FF.]/.test(expression[i])) { id += expression[i]; i++; }
      tokens.push({ type: "ident", value: id }); continue;
    }
    i++;
  }
  return tokens;
}

function clientParse(tokens: ClientToken[]): ClientASTNode {
  let pos = 0;
  function peek() { return pos < tokens.length ? tokens[pos] : null; }
  function consume() { return tokens[pos++]; }

  function parseExpr(): ClientASTNode { return parseComparison(); }
  function parseComparison(): ClientASTNode {
    let left = parseAddSub();
    while (peek()?.type === "comparison") {
      const op = consume().value; left = { kind: "binary", op, left, right: parseAddSub() };
    }
    return left;
  }
  function parseAddSub(): ClientASTNode {
    let left = parseMulDiv();
    while (peek()?.type === "op" && (peek()!.value === "+" || peek()!.value === "-")) {
      const op = consume().value; left = { kind: "binary", op, left, right: parseMulDiv() };
    }
    return left;
  }
  function parseMulDiv(): ClientASTNode {
    let left = parsePow();
    while (peek()?.type === "op" && (peek()!.value === "*" || peek()!.value === "/" || peek()!.value === "%")) {
      const op = consume().value; left = { kind: "binary", op, left, right: parsePow() };
    }
    return left;
  }
  function parsePow(): ClientASTNode {
    let left = parseUnary();
    while (peek()?.type === "op" && peek()!.value === "^") {
      consume(); left = { kind: "binary", op: "^", left, right: parseUnary() };
    }
    return left;
  }
  function parseUnary(): ClientASTNode {
    if (peek()?.type === "op" && peek()!.value === "-") { consume(); return { kind: "unary", op: "-", operand: parsePrimary() }; }
    return parsePrimary();
  }
  function parsePrimary(): ClientASTNode {
    const t = peek();
    if (!t) throw new Error("Unexpected end");
    if (t.type === "number") { consume(); return { kind: "number", value: t.value }; }
    if (t.type === "string") { consume(); return { kind: "string", value: t.value }; }
    if (t.type === "field_ref") { consume(); return { kind: "field_ref", slug: t.value }; }
    if (t.type === "ident") {
      consume();
      if (peek()?.type === "paren" && peek()!.value === "(") {
        consume();
        const args: ClientASTNode[] = [];
        if (peek()?.type !== "paren" || peek()!.value !== ")") {
          args.push(parseExpr());
          while (peek()?.type === "comma") { consume(); args.push(parseExpr()); }
        }
        consume();
        return { kind: "call", name: (t.value as string).toUpperCase(), args };
      }
      return { kind: "ident", value: t.value };
    }
    if (t.type === "paren" && t.value === "(") {
      consume(); const e = parseExpr(); consume(); return e;
    }
    throw new Error("Unexpected token");
  }

  const result = parseExpr();
  return result;
}

function clientToNum(val: any): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "string") { const n = Number(val); return isNaN(n) ? 0 : n; }
  return 0;
}

function clientEval(node: ClientASTNode, data: Record<string, any>): any {
  switch (node.kind) {
    case "number": return node.value;
    case "string": return node.value;
    case "field_ref": {
      const v = data[node.slug]; if (v == null || v === "") return 0;
      const n = Number(v); return isNaN(n) ? v : n;
    }
    case "ident": {
      const v = data[node.value]; if (v == null || v === "") return 0;
      const n = Number(v); return isNaN(n) ? v : n;
    }
    case "unary": return node.op === "-" ? -clientToNum(clientEval(node.operand, data)) : clientEval(node.operand, data);
    case "binary": {
      const l = clientEval(node.left, data), r = clientEval(node.right, data);
      switch (node.op) {
        case "+": return (typeof l === "string" || typeof r === "string") ? String(l) + String(r) : clientToNum(l) + clientToNum(r);
        case "-": return clientToNum(l) - clientToNum(r);
        case "*": return clientToNum(l) * clientToNum(r);
        case "/": { const d = clientToNum(r); if (d === 0) throw new Error("Division by zero"); return clientToNum(l) / d; }
        case "%": { const m = clientToNum(r); if (m === 0) throw new Error("Modulo by zero"); return clientToNum(l) % m; }
        case "^": return Math.pow(clientToNum(l), clientToNum(r));
        case ">": return clientToNum(l) > clientToNum(r) ? 1 : 0;
        case "<": return clientToNum(l) < clientToNum(r) ? 1 : 0;
        case ">=": return clientToNum(l) >= clientToNum(r) ? 1 : 0;
        case "<=": return clientToNum(l) <= clientToNum(r) ? 1 : 0;
        case "==": case "=": return l == r ? 1 : 0;
        case "!=": return l != r ? 1 : 0;
        default: return 0;
      }
    }
    case "call": {
      const args = node.args.map(a => clientEval(a, data));
      switch (node.name) {
        case "SUM": return args.reduce((s, v) => s + clientToNum(v), 0);
        case "AVG": return args.length === 0 ? 0 : args.reduce((s, v) => s + clientToNum(v), 0) / args.length;
        case "MIN": return Math.min(...args.map(clientToNum));
        case "MAX": return Math.max(...args.map(clientToNum));
        case "IF": {
          if (args.length < 2) return 0;
          const truthy = typeof args[0] === "number" ? args[0] !== 0 : !!args[0];
          return truthy ? args[1] : (args.length > 2 ? args[2] : 0);
        }
        case "ROUND": { const v = clientToNum(args[0]); const d = args.length > 1 ? clientToNum(args[1]) : 0; const f = Math.pow(10, d); return Math.round(v * f) / f; }
        case "ABS": return Math.abs(clientToNum(args[0]));
        case "CEIL": return Math.ceil(clientToNum(args[0]));
        case "FLOOR": return Math.floor(clientToNum(args[0]));
        case "SQRT": return Math.sqrt(clientToNum(args[0]));
        case "POW": return Math.pow(clientToNum(args[0]), clientToNum(args[1] ?? 2));
        case "CONCAT": return args.map(String).join("");
        default: return 0;
      }
    }
    default: return 0;
  }
}

function computeFormulaFieldsClient(
  data: Record<string, any>,
  allFields: any[]
): Record<string, any> {
  const result = { ...data };
  const formulaFields = allFields.filter(
    (f: any) => (f.fieldType === "formula" || f.fieldType === "computed" || f.isCalculated) && f.formulaExpression
  );

  if (formulaFields.length === 0) return result;

  const formulaSlugs = new Set(formulaFields.map((f: any) => f.slug));
  const astMap = new Map<string, ClientASTNode>();
  const depGraph = new Map<string, Set<string>>();

  for (const field of formulaFields) {
    try {
      const tokens = clientTokenize(field.formulaExpression);
      const ast = clientParse(tokens);
      astMap.set(field.slug, ast);
      const deps = new Set<string>();
      function collectRefs(n: ClientASTNode) {
        if (n.kind === "field_ref" && formulaSlugs.has(n.slug)) deps.add(n.slug);
        if (n.kind === "ident" && formulaSlugs.has(n.value)) deps.add(n.value);
        if (n.kind === "binary") { collectRefs(n.left); collectRefs(n.right); }
        if (n.kind === "unary") collectRefs(n.operand);
        if (n.kind === "call") n.args.forEach(collectRefs);
      }
      collectRefs(ast);
      depGraph.set(field.slug, deps);
    } catch (err: any) {
      result[`__formula_error_${field.slug}`] = err.message || "Parse error";
    }
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const inCycle = new Set<string>();

  function visit(slug: string) {
    if (visited.has(slug)) return;
    if (visiting.has(slug)) { inCycle.add(slug); return; }
    visiting.add(slug);
    const deps = depGraph.get(slug);
    if (deps) for (const d of deps) { visit(d); if (inCycle.has(d)) inCycle.add(slug); }
    visiting.delete(slug);
    visited.add(slug);
    sorted.push(slug);
  }

  for (const f of formulaFields) if (astMap.has(f.slug)) visit(f.slug);

  for (const slug of sorted) {
    if (inCycle.has(slug)) { result[`__formula_error_${slug}`] = "Circular reference"; continue; }
    const ast = astMap.get(slug);
    if (!ast) continue;
    try {
      const val = clientEval(ast, result);
      if (typeof val === "number" && isFinite(val)) {
        result[slug] = Math.round(val * 1e10) / 1e10;
        delete result[`__formula_error_${slug}`];
      } else if (typeof val === "number") {
        result[`__formula_error_${slug}`] = "Result is infinite";
      } else {
        result[slug] = val;
        delete result[`__formula_error_${slug}`];
      }
    } catch (err: any) {
      result[`__formula_error_${slug}`] = err.message || "Calculation error";
    }
  }

  return result;
}

function isFieldVisible(field: any, formData: Record<string, any>): boolean {
  const rules = field.displayRules;
  if (!rules || !rules.conditionField) return true;
  const conditionValue = formData[rules.conditionField];
  const targetValue = rules.conditionValue;
  const operator = rules.conditionOperator || "equals";
  switch (operator) {
    case "equals": return String(conditionValue) === String(targetValue);
    case "not_equals": return String(conditionValue) !== String(targetValue);
    case "contains": return String(conditionValue || "").includes(String(targetValue || ""));
    case "not_empty": return conditionValue !== undefined && conditionValue !== null && conditionValue !== "";
    case "is_empty": return conditionValue === undefined || conditionValue === null || conditionValue === "";
    default: return true;
  }
}

function DynamicFormModal({ fields, statuses, record, entityName, formDefinition, validationRules = [], allFields = [], transitions = [], relations = [], entityId, onClose, onSubmit, onAutoSave, isLoading, readOnly = false }: {
  fields: any[]; statuses: any[]; record: any; entityName: string; formDefinition?: any;
  validationRules?: any[]; allFields?: any[]; transitions?: any[]; relations?: any[]; entityId?: number;
  onClose: () => void; onSubmit: (data: any) => void;
  onAutoSave?: (data: { data: Record<string, any>; status?: string }) => Promise<void>;
  isLoading: boolean; readOnly?: boolean;
}) {
  if (readOnly) {
    const widthClass: Record<string, string> = { full: "col-span-2", half: "col-span-1", third: "col-span-1", quarter: "col-span-1" };
    const currentStatus = statuses.find((s: any) => s.slug === record?.status);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">צפייה: {entityName}</h2>
              {currentStatus && (() => {
                const colorDef = STATUS_COLORS.find(c => c.key === currentStatus.color);
                return (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-medium border"
                    style={{ backgroundColor: `${colorDef?.hex}20`, color: colorDef?.hex, borderColor: `${colorDef?.hex}40` }}>
                    {currentStatus.name}
                  </span>
                );
              })()}
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 opacity-80 pointer-events-none">
            {fields.map((field: any) => (
              <div key={field.slug} className={widthClass[field.fieldWidth] || "col-span-2"}>
                <label className="block text-sm font-medium mb-1.5">{field.name}</label>
                {renderFormField(field, record?.data?.[field.slug] ?? "", () => {})}
              </div>
            ))}
          </div>
          {statuses.length > 0 && (
            <div className="mt-4 opacity-80 pointer-events-none">
              <label className="block text-sm font-medium mb-1.5">סטטוס</label>
              <div className="flex gap-2 flex-wrap">
                {statuses.map((s: any) => {
                  const colorDef = STATUS_COLORS.find(c => c.key === s.color);
                  return (
                    <span key={s.slug}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${record?.status === s.slug ? "border-white/40" : "border-border"}`}
                      style={{ backgroundColor: record?.status === s.slug ? `${colorDef?.hex}30` : "transparent", color: colorDef?.hex }}>
                      {s.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {record && entityId && relations.filter((r: any) => r.relationType === "inline_child" && r.sourceEntityId === entityId).map((rel: any) => (
            <div key={rel.id} className="mt-4">
              <InlineChildGridReadOnly parentRecordId={record.id} childEntityId={rel.targetEntityId} relation={rel} />
            </div>
          ))}
          <div className="mt-6 pt-4 border-t border-border">
            <button onClick={onClose} className="w-full px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">סגור</button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <DynamicFormRenderer
      fields={fields}
      allFields={allFields}
      statuses={statuses}
      record={record}
      entityName={entityName}
      entityId={entityId}
      formDefinition={formDefinition}
      validationRules={validationRules}
      transitions={transitions}
      relations={relations}
      onClose={onClose}
      onSubmit={onSubmit}
      onAutoSave={onAutoSave}
      isLoading={isLoading}
      mode="modal"
    />
  );
}

function RelationPicker({ field, value, onChange }: { field: any; value: any; onChange: (val: any) => void }) {
  const cls = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const settings = field.settings || {};
  const relatedEntityId = settings.relatedEntityId || field.relatedEntityId;
  const isMulti = field.fieldType === "relation_list";
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedIds: number[] = isMulti
    ? (Array.isArray(value) ? value.map(Number).filter(n => !isNaN(n)) : (value ? [Number(value)].filter(n => !isNaN(n)) : []))
    : (value ? [Number(value)].filter(n => !isNaN(n)) : []);

  const { data: relatedRecords = [] } = useQuery({
    queryKey: ["relation-picker", relatedEntityId, searchText],
    queryFn: async () => {
      if (!relatedEntityId) return [];
      const params = new URLSearchParams({ limit: "20" });
      if (searchText) params.set("search", searchText);
      const r = await authFetch(`${API}/platform/entities/${relatedEntityId}/records?${params}`);
      const data = await r.json();
      return data.records || [];
    },
    enabled: !!relatedEntityId && isOpen,
  });

  const { data: selectedRecords = [] } = useQuery({
    queryKey: ["relation-selected-multi", relatedEntityId, JSON.stringify(selectedIds)],
    queryFn: async () => {
      if (!relatedEntityId || selectedIds.length === 0) return [];
      const results = await Promise.all(
        selectedIds.map(async (id) => {
          try {
            const r = await authFetch(`${API}/platform/entities/${relatedEntityId}/records/${id}`);
            if (!r.ok) return null;
            return r.json();
          } catch { return null; }
        })
      );
      return results.filter(Boolean);
    },
    enabled: !!relatedEntityId && selectedIds.length > 0,
  });

  const getRecordLabel = (rec: any) => {
    const d = rec?.data || {};
    return d[Object.keys(d)[0]] || `#${rec?.id}`;
  };

  if (!relatedEntityId) {
    return <div className={`${cls} text-muted-foreground`}>לא הוגדרה ישות קשורה</div>;
  }

  const handleSelect = (recId: number) => {
    if (isMulti) {
      if (selectedIds.includes(recId)) {
        onChange(selectedIds.filter(id => id !== recId));
      } else {
        onChange([...selectedIds, recId]);
      }
    } else {
      onChange(recId);
      setIsOpen(false);
      setSearchText("");
    }
  };

  const handleRemove = (recId: number) => {
    if (isMulti) {
      onChange(selectedIds.filter(id => id !== recId));
    } else {
      onChange("");
    }
  };

  return (
    <div className="relative">
      {isMulti && selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedRecords.map((rec: any) => (
            <span key={rec.id} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs">
              {getRecordLabel(rec)}
              <button type="button" onClick={() => handleRemove(rec.id)}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className={`${cls} cursor-pointer flex items-center justify-between`} onClick={() => setIsOpen(!isOpen)}>
        <span className={!isMulti && selectedIds.length > 0 ? "" : "text-muted-foreground"}>
          {isMulti
            ? (isOpen ? "חיפוש והוספה..." : `${selectedIds.length > 0 ? `${selectedIds.length} נבחרו` : "בחר רשומות..."}`)
            : (selectedRecords.length > 0 ? getRecordLabel(selectedRecords[0]) : (selectedIds.length > 0 ? `#${selectedIds[0]}` : "בחר רשומה..."))
          }
        </span>
        <div className="flex items-center gap-1">
          {!isMulti && selectedIds.length > 0 && (
            <button type="button" onClick={e => { e.stopPropagation(); handleRemove(selectedIds[0]); }} className="p-0.5 hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-border">
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="חיפוש..." autoFocus
              className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {relatedRecords.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">לא נמצאו רשומות</p>
            ) : relatedRecords.map((rec: any) => {
              const isSelected = selectedIds.includes(rec.id);
              return (
                <button key={rec.id} type="button" onClick={() => handleSelect(rec.id)}
                  className={`w-full text-right px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 ${isSelected ? "bg-primary/10" : ""}`}>
                  {isMulti && (
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                      {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">#{rec.id}</span>
                  <span className="truncate">{getRecordLabel(rec)}</span>
                </button>
              );
            })}
          </div>
          {isMulti && (
            <div className="p-2 border-t border-border">
              <button type="button" onClick={() => { setIsOpen(false); setSearchText(""); }}
                className="w-full text-center text-xs text-primary hover:text-primary/80 py-1">סגור</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileUploadField({ field, value, onChange }: { field: any; value: any; onChange: (val: any) => void }) {
  const cls = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm";
  const isImage = field.fieldType === "image";
  const currentFiles = Array.isArray(value) ? value : (value ? [value] : []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const fileData = { name: file.name, size: file.size, type: file.type, dataUrl: reader.result as string, uploadedAt: new Date().toISOString() };
      if (field.fieldType === "image") {
        onChange(fileData);
      } else {
        onChange([...currentFiles, fileData]);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      {isImage && value?.dataUrl && (
        <div className="relative w-24 h-24 rounded-xl border border-border overflow-hidden bg-muted">
          <img src={value.dataUrl} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full"><X className="w-3 h-3 text-foreground" /></button>
        </div>
      )}
      {!isImage && currentFiles.length > 0 && (
        <div className="space-y-1">
          {currentFiles.map((f: any, i: number) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-lg text-xs">
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="truncate flex-1">{f.name || f}</span>
              <button type="button" onClick={() => onChange(currentFiles.filter((_: any, j: number) => j !== i))} className="p-0.5 hover:bg-muted rounded"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
      <label className={`${cls} cursor-pointer flex items-center gap-2 justify-center border-dashed hover:border-primary/50 transition-colors`}>
        <input type="file" className="hidden" accept={isImage ? "image/*" : undefined} onChange={handleFileSelect} />
        {isImage ? <Image className="w-4 h-4 text-muted-foreground" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
        <span className="text-muted-foreground">{isImage ? "העלה תמונה" : "העלה קובץ"}</span>
      </label>
    </div>
  );
}

function UserReferencePicker({ value, onChange, placeholder }: { value: any; onChange: (val: any) => void; placeholder?: string }) {
  const [search, setSearch] = useState(typeof value === "object" ? (value?.name || value?.email || "") : (value || ""));
  const [open, setOpen] = useState(false);
  const { data: users } = useQuery({
    queryKey: ["platform-users-search", search],
    queryFn: () => authFetch(`/api/platform/users?search=${encodeURIComponent(search)}&limit=10`).then(r => r.ok ? r.json() : []),
    enabled: open && search.length >= 1,
  });

  return (
    <div className="relative">
      <input type="text" value={search} onChange={e => { setSearch(e.target.value); setOpen(true); onChange(e.target.value); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
      {open && Array.isArray(users) && users.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {users.map((u: any) => (
            <button key={u.id} type="button" className="w-full text-right px-3 py-2 hover:bg-muted text-sm" onClick={() => {
              setSearch(u.name || u.email || u.id);
              onChange({ id: u.id, name: u.name, email: u.email });
              setOpen(false);
            }}>
              <span className="font-medium">{u.name || u.email}</span>
              {u.email && u.name && <span className="text-xs text-muted-foreground mr-2">{u.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BarcodeVisual({ value }: { value: string }) {
  const bars = useMemo(() => {
    const result: { x: number; w: number }[] = [];
    let x = 0;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      const widths = [(code >> 4) & 0x0f, code & 0x0f, ((code >> 2) & 0x03) + 1, (code & 0x03) + 1];
      for (let j = 0; j < widths.length; j++) {
        const w = Math.max(1, widths[j] % 4 + 1);
        if (j % 2 === 0) result.push({ x, w });
        x += w;
      }
    }
    return { bars: result, totalWidth: x };
  }, [value]);

  return (
    <div className="bg-white border border-border rounded-lg p-3 text-center">
      <svg viewBox={`0 0 ${bars.totalWidth} 40`} className="h-12 w-full max-w-xs mx-auto" preserveAspectRatio="none">
        {bars.bars.map((b, i) => (
          <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="#000" />
        ))}
      </svg>
      <p className="text-xs font-mono mt-1 tracking-widest">{value}</p>
    </div>
  );
}

function QRVisual({ value }: { value: string }) {
  const grid = useMemo(() => {
    const size = Math.max(11, Math.min(21, Math.ceil(Math.sqrt(value.length * 8))));
    const cells: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      const isBorder = i === 0 || i === 6 || j === 0 || j === 6;
      const isInner = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      cells[i][j] = isBorder || isInner;
      cells[i][size - 1 - j] = isBorder || isInner;
      cells[size - 1 - i][j] = isBorder || isInner;
    }
    let bitIdx = 0;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      for (let b = 7; b >= 0; b--) {
        const row = Math.floor(bitIdx / (size - 8)) + 8;
        const col = (bitIdx % (size - 8)) + 8;
        if (row < size && col < size) {
          cells[row][col] = (code >> b) & 1 ? true : false;
        }
        bitIdx++;
      }
    }
    return { cells, size };
  }, [value]);

  return (
    <div className="bg-white border border-border rounded-lg p-3 inline-block">
      <svg viewBox={`0 0 ${grid.size} ${grid.size}`} className="w-24 h-24">
        {grid.cells.map((row, ri) => row.map((cell, ci) =>
          cell ? <rect key={`${ri}-${ci}`} x={ci} y={ri} width={1} height={1} fill="#000" /> : null
        ))}
      </svg>
      <p className="text-xs font-mono mt-1 text-center max-w-24 truncate">{value}</p>
    </div>
  );
}

function RichTextEditor({ value, onChange, placeholder }: { value: string; onChange: (val: string) => void; placeholder?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (editorRef.current && !initialized) {
      editorRef.current.innerHTML = value || "";
      setInitialized(true);
    }
  }, [initialized, value]);

  const execCmd = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
    editorRef.current?.focus();
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-muted/30 border-b border-border flex-wrap">
        <button type="button" onClick={() => execCmd("bold")} className="px-2 py-1 text-xs font-bold hover:bg-muted rounded" title="Bold">B</button>
        <button type="button" onClick={() => execCmd("italic")} className="px-2 py-1 text-xs italic hover:bg-muted rounded" title="Italic">I</button>
        <button type="button" onClick={() => execCmd("underline")} className="px-2 py-1 text-xs underline hover:bg-muted rounded" title="Underline">U</button>
        <button type="button" onClick={() => execCmd("strikeThrough")} className="px-2 py-1 text-xs line-through hover:bg-muted rounded" title="Strikethrough">S</button>
        <span className="w-px h-4 bg-border mx-1" />
        <button type="button" onClick={() => execCmd("insertUnorderedList")} className="px-2 py-1 text-xs hover:bg-muted rounded" title="Bullet list">• List</button>
        <button type="button" onClick={() => execCmd("insertOrderedList")} className="px-2 py-1 text-xs hover:bg-muted rounded" title="Numbered list">1. List</button>
        <span className="w-px h-4 bg-border mx-1" />
        <button type="button" onClick={() => execCmd("formatBlock", "h2")} className="px-2 py-1 text-xs hover:bg-muted rounded" title="Heading 2">H2</button>
        <button type="button" onClick={() => execCmd("formatBlock", "h3")} className="px-2 py-1 text-xs hover:bg-muted rounded" title="Heading 3">H3</button>
        <button type="button" onClick={() => execCmd("formatBlock", "p")} className="px-2 py-1 text-xs hover:bg-muted rounded" title="Paragraph">P</button>
        <span className="w-px h-4 bg-border mx-1" />
        <button type="button" onClick={() => { const url = prompt("URL:"); if (url) execCmd("createLink", url); }} className="px-2 py-1 text-xs hover:bg-muted rounded" title="Link">Link</button>
        <button type="button" onClick={() => execCmd("removeFormat")} className="px-2 py-1 text-xs hover:bg-muted rounded text-muted-foreground" title="Clear format">Clear</button>
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={() => { if (editorRef.current) onChange(editorRef.current.innerHTML); }}
        data-placeholder={placeholder}
        className="min-h-[120px] max-h-[300px] overflow-y-auto px-3 py-2.5 text-sm focus:outline-none bg-background prose prose-sm max-w-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground" />
    </div>
  );
}

function SignatureCanvas({ value, onChange }: { value: any; onChange: (val: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value && typeof value === "string" && value.startsWith("data:image")) {
      const img = document.createElement("img");
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL());
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} width={400} height={120}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        className="border border-border rounded-xl bg-white cursor-crosshair w-full touch-none" style={{ height: 120 }} />
      <div className="flex gap-2">
        <button type="button" onClick={clear} className="text-xs px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20">
          נקה חתימה
        </button>
      </div>
    </div>
  );
}

function renderFormField(field: any, value: any, onChange: (val: any) => void): React.ReactNode {
  const cls = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const type = field.fieldType;

  if (type === "long_text" || type === "textarea") {
    return <textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={3} placeholder={field.placeholder} className={`${cls} resize-none`} />;
  }
  if (type === "rich_text") {
    return <RichTextField value={value} onChange={onChange} placeholder={field.placeholder || "טקסט מעוצב..."} />;
  }
  if (type === "number" || type === "decimal" || type === "currency" || type === "percent") {
    return (
      <div className="relative">
        <input type="number" value={value ?? ""} onChange={e => onChange(e.target.value ? Number(e.target.value) : "")}
          placeholder={field.placeholder} step={type === "decimal" || type === "currency" ? "0.01" : "1"} dir="ltr" className={`${cls} ${type === "currency" ? "pr-8" : ""}`} />
        {type === "currency" && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₪</span>}
        {type === "percent" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>}
      </div>
    );
  }
  if (type === "date") {
    return <input type="date" value={value || ""} onChange={e => onChange(e.target.value)} className={cls} dir="ltr" />;
  }
  if (type === "datetime") {
    return <input type="datetime-local" value={value || ""} onChange={e => onChange(e.target.value)} className={cls} dir="ltr" />;
  }
  if (type === "time") {
    return <input type="time" value={value || ""} onChange={e => onChange(e.target.value)} className={cls} dir="ltr" />;
  }
  if (type === "boolean" || type === "checkbox") {
    return (
      <label className="flex items-center gap-2 cursor-pointer py-2">
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="w-5 h-5 rounded border-border text-primary focus:ring-primary" />
        <span className="text-sm">{value ? "כן" : "לא"}</span>
      </label>
    );
  }
  if (type === "radio") {
    const options = Array.isArray(field.options) ? field.options : [];
    return (
      <div className="flex flex-wrap gap-2 py-1">
        {options.map((opt: any) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return (
            <label key={optValue} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${value === optValue ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
              <input type="radio" name={field.slug} value={optValue} checked={value === optValue} onChange={() => onChange(optValue)} className="hidden" />
              {optLabel}
            </label>
          );
        })}
      </div>
    );
  }
  if (type === "single_select" || type === "status" || type === "category") {
    const options = Array.isArray(field.options) ? field.options : [];
    return (
      <select value={value || ""} onChange={e => onChange(e.target.value)} className={cls}>
        <option value="">בחר...</option>
        {options.map((opt: any) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return <option key={optValue} value={optValue}>{optLabel}</option>;
        })}
      </select>
    );
  }
  if (type === "multi_select" || type === "tags") {
    const options = Array.isArray(field.options) ? field.options : [];
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {selected.map((v: string, i: number) => (
            <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs">
              {v}
              <button type="button" onClick={() => onChange(selected.filter((_: any, j: number) => j !== i))}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        {type === "tags" ? (
          <div className="flex gap-2">
            <input type="text" placeholder="הקלד תגית..." className={cls}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v && !selected.includes(v)) { onChange([...selected, v]); (e.target as HTMLInputElement).value = ""; } } }} />
          </div>
        ) : (
          <select onChange={e => { if (e.target.value && !selected.includes(e.target.value)) onChange([...selected, e.target.value]); e.target.value = ""; }} className={cls}>
            <option value="">הוסף...</option>
            {options.filter((opt: any) => !selected.includes(typeof opt === "string" ? opt : opt.value)).map((opt: any) => {
              const optValue = typeof opt === "string" ? opt : opt.value;
              const optLabel = typeof opt === "string" ? opt : (opt.label || opt.value);
              return <option key={optValue} value={optValue}>{optLabel}</option>;
            })}
          </select>
        )}
      </div>
    );
  }
  if (type === "relation" || type === "relation_list") {
    return <RelationPicker field={field} value={value} onChange={onChange} />;
  }
  if (type === "file" || type === "image") {
    return <FileUploadField field={field} value={value} onChange={onChange} />;
  }
  if (type === "email") {
    return <input type="email" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "email@example.com"} dir="ltr" className={cls} />;
  }
  if (type === "phone") {
    return <input type="tel" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "050-000-0000"} dir="ltr" className={cls} />;
  }
  if (type === "url") {
    return <input type="url" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "https://"} dir="ltr" className={cls} />;
  }
  if (type === "address") {
    const addr = typeof value === "object" && value ? value : { street: "", city: "", zip: "", country: "" };
    return (
      <div className="space-y-2">
        <input type="text" value={addr.street || ""} onChange={e => onChange({ ...addr, street: e.target.value })} placeholder="רחוב" className={cls} />
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={addr.city || ""} onChange={e => onChange({ ...addr, city: e.target.value })} placeholder="עיר" className={cls} />
          <input type="text" value={addr.zip || ""} onChange={e => onChange({ ...addr, zip: e.target.value })} placeholder="מיקוד" dir="ltr" className={cls} />
        </div>
        <input type="text" value={addr.country || ""} onChange={e => onChange({ ...addr, country: e.target.value })} placeholder="מדינה" className={cls} />
      </div>
    );
  }
  if (type === "json") {
    return <JsonEditor value={value} onChange={onChange} />;
  }
  if (type === "signature") {
    return <SignatureField value={value} onChange={onChange} />;
  }
  if (type === "barcode") {
    return (
      <div className="space-y-2">
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "הכנס ערך ברקוד"} dir="ltr" className={cls} />
        {value && <BarcodeDisplay value={value} />}
      </div>
    );
  }
  if (type === "qr") {
    return (
      <div className="space-y-2">
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "הכנס ערך QR"} dir="ltr" className={cls} />
        {value && <QRDisplay value={value} />}
      </div>
    );
  }
  if (type === "color") {
    return (
      <div className="flex items-center gap-2">
        <input type="color" value={value || "#000000"} onChange={e => onChange(e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder="#000000" dir="ltr" className={cls} />
      </div>
    );
  }
  if (type === "duration") {
    const mins = Number(value) || 0;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <input type="number" min={0} value={hours} onChange={e => { const h = parseInt(e.target.value) || 0; onChange(h * 60 + minutes); }} className={`w-20 ${cls}`} dir="ltr" />
          <span className="text-xs text-muted-foreground">שעות</span>
        </div>
        <div className="flex items-center gap-1">
          <input type="number" min={0} max={59} value={minutes} onChange={e => { const m = Math.min(59, parseInt(e.target.value) || 0); onChange(hours * 60 + m); }} className={`w-20 ${cls}`} dir="ltr" />
          <span className="text-xs text-muted-foreground">דקות</span>
        </div>
      </div>
    );
  }
  if (type === "user_reference") {
    return <UserReferencePicker value={value} onChange={onChange} placeholder={field.placeholder || "בחר משתמש..."} />;
  }
  if (type === "signature") {
    return <SignatureCanvas value={value} onChange={onChange} />;
  }
  if (type === "barcode") {
    return (
      <div className="space-y-2">
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "Barcode value"} dir="ltr" className={cls} />
        {value && <BarcodeVisual value={String(value)} />}
      </div>
    );
  }
  if (type === "qr") {
    return (
      <div className="space-y-2">
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "QR code value"} dir="ltr" className={cls} />
        {value && <QRVisual value={String(value)} />}
      </div>
    );
  }
  if (type === "sub_table") {
    return <SubTableEditor field={field} value={value} onChange={onChange} />;
  }
  if (type === "auto_number") {
    return (
      <div className="px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm text-muted-foreground">
        {value !== undefined && value !== null && value !== "" ? (
          <span className="font-mono">{String(value)}</span>
        ) : (
          <span>ייווצר אוטומטית</span>
        )}
      </div>
    );
  }
  if (type === "formula" || type === "computed") {
    const formulaError = field._formulaError;
    return (
      <div className="space-y-1">
        <div className={`px-3 py-2.5 border rounded-xl text-sm ${formulaError ? "bg-destructive/5 border-destructive/30" : "bg-purple-500/5 border-purple-500/20"}`}>
          {formulaError ? (
            <span className="text-destructive text-xs">{formulaError}</span>
          ) : value !== undefined && value !== null && value !== "" ? (
            <span className="font-mono font-medium text-purple-400">{typeof value === "number" ? value.toLocaleString() : String(value)}</span>
          ) : (
            <span className="text-muted-foreground">יחושב אוטומטית</span>
          )}
        </div>
        {field.formulaExpression && (
          <p className="text-[10px] text-muted-foreground font-mono px-1 truncate" title={field.formulaExpression}>
            = {field.formulaExpression}
          </p>
        )}
      </div>
    );
  }
  return <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className={cls} />;
}

function SubTableEditor({ field, value, onChange }: { field: any; value: any; onChange: (val: any) => void }) {
  const rows: any[] = Array.isArray(value) ? value : [];
  const settings = field.settings || {};
  const columns: Array<{ slug: string; name: string; type: string }> = settings.columns || [
    { slug: "item", name: "פריט", type: "text" },
    { slug: "quantity", name: "כמות", type: "number" },
    { slug: "price", name: "מחיר", type: "number" },
  ];
  const maxRows = settings.maxRows || 100;

  const addRow = () => {
    if (rows.length >= maxRows) return;
    const newRow: Record<string, any> = {};
    columns.forEach(col => { newRow[col.slug] = col.type === "number" || col.type === "currency" ? 0 : ""; });
    onChange([...rows, newRow]);
  };

  const updateRow = (idx: number, colSlug: string, val: any) => {
    const updated = rows.map((r, i) => i === idx ? { ...r, [colSlug]: val } : r);
    onChange(updated);
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="col-span-2 border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground w-8">#</th>
              {columns.map(col => (
                <th key={col.slug} className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">{col.name}</th>
              ))}
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 last:border-0">
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                {columns.map(col => (
                  <td key={col.slug} className="px-1 py-1">
                    {col.type === "number" || col.type === "currency" ? (
                      <input type="number" value={row[col.slug] ?? ""} onChange={e => updateRow(idx, col.slug, e.target.value ? Number(e.target.value) : "")}
                        step={col.type === "currency" ? "0.01" : "1"}
                        className="w-full px-2 py-1.5 bg-background border border-border/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    ) : col.type === "boolean" ? (
                      <input type="checkbox" checked={!!row[col.slug]} onChange={e => updateRow(idx, col.slug, e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary" />
                    ) : col.type === "date" ? (
                      <input type="date" value={row[col.slug] || ""} onChange={e => updateRow(idx, col.slug, e.target.value)}
                        className="w-full px-2 py-1.5 bg-background border border-border/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    ) : (
                      <input type="text" value={row[col.slug] || ""} onChange={e => updateRow(idx, col.slug, e.target.value)}
                        className="w-full px-2 py-1.5 bg-background border border-border/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    )}
                  </td>
                ))}
                <td className="px-1 py-1">
                  <button type="button" onClick={() => removeRow(idx)} className="p-1 hover:bg-destructive/10 rounded">
                    <X className="w-3 h-3 text-destructive" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 border-t border-border/50 bg-muted/10">
        <button type="button" onClick={addRow} disabled={rows.length >= maxRows}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 disabled:opacity-50">
          <Plus className="w-3 h-3" />
          הוסף שורה
        </button>
      </div>
    </div>
  );
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "יצירת רשומה",
  update: "עדכון רשומה",
  delete: "מחיקת רשומה",
  status_change: "שינוי סטטוס",
  bulk_update: "עדכון מרובה",
  bulk_delete: "מחיקה מרובה",
  import: "ייבוא",
  publish: "פרסום",
  unpublish: "ביטול פרסום",
  restore: "שחזור גרסה",
  reassign: "הקצאה מחדש",
};

const AUDIT_ACTION_COLORS: Record<string, string> = {
  create: "bg-green-500",
  update: "bg-blue-500",
  delete: "bg-red-500",
  status_change: "bg-amber-500",
  bulk_update: "bg-blue-400",
  bulk_delete: "bg-red-400",
  import: "bg-purple-500",
  publish: "bg-green-400",
  unpublish: "bg-gray-400",
  restore: "bg-indigo-500",
  reassign: "bg-cyan-500",
};

function formatAuditChanges(changes: any): { key: string; from: string; to: string }[] {
  if (!changes || typeof changes !== "object") return [];
  const diffs: { key: string; from: string; to: string }[] = [];

  if (changes.oldStatus !== undefined || changes.newStatus !== undefined) {
    diffs.push({ key: "סטטוס", from: String(changes.oldStatus || "-"), to: String(changes.newStatus || "-") });
  }
  if (changes.oldAssignedTo !== undefined || changes.newAssignedTo !== undefined) {
    diffs.push({ key: "הקצאה", from: String(changes.oldAssignedTo || "-"), to: String(changes.newAssignedTo || "-") });
  }

  if (changes.old && changes.new && typeof changes.old === "object" && typeof changes.new === "object") {
    const allKeys = new Set([...Object.keys(changes.old), ...Object.keys(changes.new)]);
    for (const k of allKeys) {
      if (k.startsWith("_")) continue;
      const oldVal = changes.old[k];
      const newVal = changes.new[k];
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        diffs.push({ key: k, from: String(oldVal ?? "-"), to: String(newVal ?? "-") });
      }
    }
  }

  return diffs.slice(0, 5);
}

function AuditTrail({ recordId, entityId }: { recordId: number; entityId: number }) {
  const { data: auditLogs = [] } = useQuery({
    queryKey: ["record-audit", recordId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/records/${recordId}/audit`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  if (auditLogs.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-3">אין היסטוריית שינויים</p>;
  }

  return (
    <div className="space-y-0 max-h-64 overflow-y-auto pr-1">
      {auditLogs.slice(0, 30).map((log: any, i: number) => {
        const actionLabel = AUDIT_ACTION_LABELS[log.action] || log.action;
        const dotColor = AUDIT_ACTION_COLORS[log.action] || "bg-primary";
        const diffs = formatAuditChanges(log.changes);
        const isLast = i === Math.min(auditLogs.length, 30) - 1;

        return (
          <div key={i} className="flex gap-3 text-xs">
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 flex-shrink-0`} />
              {!isLast && <div className="w-px flex-1 bg-border min-h-[16px]" />}
            </div>
            <div className="flex-1 min-w-0 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{log.performedBy || log.userName || log.userId || "מערכת"}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{actionLabel}</span>
                <span className="text-muted-foreground/60 mr-auto">{new Date(log.createdAt || log.timestamp).toLocaleString("he-IL")}</span>
              </div>
              {diffs.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {diffs.map((d, di) => (
                    <div key={di} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/70">{d.key}:</span>{" "}
                      <span className="line-through text-muted-foreground/60">{d.from}</span>
                      <span className="mx-1">→</span>
                      <span className="text-foreground/80">{d.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecordDetailModal({ record, fields, statuses, entityName, entityId, detailDefinition, relations, actions, onClose, onEdit, onExecuteAction }: {
  record: any; fields: any[]; statuses: any[]; entityName: string; entityId: number;
  detailDefinition: any; relations: any[]; actions?: any[];
  onClose: () => void; onEdit?: () => void; onExecuteAction?: (action: any) => void;
}) {
  const data = record.data || {};
  const statusDef = statuses.find((s: any) => s.slug === record.status);
  const statusColorDef = STATUS_COLORS.find(c => c.key === statusDef?.color);
  const [showAudit, setShowAudit] = useState(true);

  const hasSections = detailDefinition?.sections && Array.isArray(detailDefinition.sections) && detailDefinition.sections.length > 0;
  const showRelated = detailDefinition?.showRelatedRecords !== false;

  const detailFields = hasSections ? [] : fields.filter((f: any) => f.showInDetail);

  const visibleActions = (actions || []).filter((a: any) => a.showInDetail !== false && a.isActive !== false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{entityName} #{record.id}</h2>
          <div className="flex items-center gap-2">
            {statusDef && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${statusColorDef?.hex || "#6b7280"}20`, color: statusColorDef?.hex || "#6b7280" }}>
                {statusDef.name}
              </span>
            )}
            {onEdit && <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm"><Edit2 className="w-3.5 h-3.5" />עריכה</button>}
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {visibleActions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border">
            {visibleActions.map((action: any) => {
              const colorDef = STATUS_COLORS.find(c => c.key === action.color);
              return (
                <button key={action.id}
                  onClick={() => onExecuteAction?.(action)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors border"
                  style={{ borderColor: colorDef?.hex || "#6b7280", backgroundColor: `${colorDef?.hex || "#6b7280"}15`, color: colorDef?.hex || "#6b7280" }}
                  title={action.description || action.name}>
                  <Play className="w-3.5 h-3.5" />
                  {action.name}
                </button>
              );
            })}
          </div>
        )}

        {(() => {
          const phoneField = fields.find((f: any) => f.fieldType === "phone");
          const emailField = fields.find((f: any) => f.fieldType === "email");
          const nameField = fields.find((f: any) => f.slug === "name" || f.slug === "full_name" || f.slug === "company_name");
          const phone = phoneField ? data[phoneField.slug] : undefined;
          const email = emailField ? data[emailField.slug] : undefined;
          const displayName = nameField ? data[nameField.slug] : `${entityName} #${record.id}`;
          return (
            <div className="mb-4 pb-4 border-b border-border">
              <MessagingActions
                entityType={entityName}
                entityId={record.id}
                entityName={displayName || `${entityName} #${record.id}`}
                phone={phone}
                email={email}
              />
            </div>
          );
        })()}

        {hasSections ? (
          <div className="space-y-4 sm:space-y-6">
            {detailDefinition.sections.map((section: any, sIdx: number) => {
              const sectionFields = Array.isArray(section.fields) ? section.fields : [];
              return (
                <div key={sIdx}>
                  {detailDefinition.sections.length > 1 && (
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 pb-2 border-b border-border">
                      {section.name}
                    </h3>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sectionFields.map((slug: string) => {
                      const f = fields.find(field => field.slug === slug);
                      if (!f) return null;
                      return (
                        <div key={f.slug} className={f.fieldWidth === "full" ? "col-span-2" : "col-span-1"}>
                          <p className="text-xs text-muted-foreground mb-1">{f.name}</p>
                          <div className="text-sm font-medium">{renderCellValue(data[f.slug], f)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {detailFields.map((f: any) => (
              <div key={f.slug} className={f.fieldWidth === "full" ? "col-span-2" : "col-span-1"}>
                <p className="text-xs text-muted-foreground mb-1">{f.name}</p>
                <div className="text-sm font-medium">{renderCellValue(data[f.slug], f)}</div>
              </div>
            ))}
          </div>
        )}

        {relations.filter((r: any) => r.relationType === "inline_child" && r.sourceEntityId === entityId).map((rel: any) => (
          <div key={rel.id} className="mt-6 pt-4 border-t border-border">
            <InlineChildGridReadOnly parentRecordId={record.id} childEntityId={rel.targetEntityId} relation={rel} />
          </div>
        ))}

        {showRelated && relations.filter((r: any) => r.relationType !== "inline_child").length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              רשומות קשורות
            </h3>
            <div className="space-y-3">
              {relations.filter((r: any) => r.relationType !== "inline_child").map((rel: any) => (
                <RelatedRecordsSection key={rel.id} relation={rel} currentEntityId={entityId} recordId={record.id} currentRecordData={data} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border">
          <button onClick={() => setShowAudit(!showAudit)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
            <Activity className="w-4 h-4" />
            <span>היסטוריית שינויים</span>
            {showAudit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showAudit && <AuditTrail recordId={record.id} entityId={entityId} />}
        </div>

        <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>נוצר: {new Date(record.createdAt).toLocaleString("he-IL")}</span>
          <span>עודכן: {new Date(record.updatedAt).toLocaleString("he-IL")}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

const RELATION_TYPE_LABELS: Record<string, string> = {
  one_to_one: "אחד לאחד",
  one_to_many: "אחד לרבים",
  many_to_many: "רבים לרבים",
  inline_child: "תת-טבלה",
};

function RelatedRecordsSection({ relation, currentEntityId, recordId, currentRecordData }: { relation: any; currentEntityId: number; recordId: number; currentRecordData: any }) {
  const isSource = relation.sourceEntityId === currentEntityId;
  const relatedEntityId = isSource ? relation.targetEntityId : relation.sourceEntityId;
  const label = isSource ? relation.label : (relation.reverseLabel || relation.label);
  const foreignKeySlug = isSource ? relation.targetFieldSlug : relation.sourceFieldSlug;
  const sourceFieldSlug = isSource ? relation.sourceFieldSlug : relation.targetFieldSlug;

  const lookupValue = useMemo(() => {
    if (sourceFieldSlug && currentRecordData && currentRecordData[sourceFieldSlug] != null && currentRecordData[sourceFieldSlug] !== "") {
      return String(currentRecordData[sourceFieldSlug]);
    }
    return String(recordId);
  }, [sourceFieldSlug, currentRecordData, recordId]);

  const { data: relatedEntity } = useQuery({
    queryKey: ["platform-entity", relatedEntityId],
    queryFn: () => authFetch(`${API}/platform/entities/${relatedEntityId}`).then(r => r.json()),
  });

  const { data: relatedRecordsData } = useQuery({
    queryKey: ["related-records", relatedEntityId, recordId, relation.id, foreignKeySlug, lookupValue],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20" });
      if (foreignKeySlug) {
        params.set("filterField", foreignKeySlug);
        params.set("filterValue", lookupValue);
      }
      const r = await authFetch(`${API}/platform/entities/${relatedEntityId}/records?${params}`);
      return r.json();
    },
    enabled: !!relatedEntity,
  });

  const relatedRecords = relatedRecordsData?.records || [];

  const relatedFields = (relatedEntity?.fields || []).filter((f: any) => f.showInList).slice(0, 4);

  if (!relatedEntity) return null;

  return (
    <div className="bg-background border border-border/50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-md">
            {RELATION_TYPE_LABELS[relation.relationType] || relation.relationType}
          </span>
          {relatedRecords.length > 0 && (
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-md">
              {relatedRecords.length}
            </span>
          )}
        </div>
        <Link href={`/builder/data/${relatedEntityId}`} className="text-xs text-primary hover:underline">
          צפה בכל ←
        </Link>
      </div>
      {relatedRecords.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">אין רשומות קשורות</p>
      ) : (
        <div className="space-y-1">
          {relatedRecords.slice(0, 5).map((rec: any) => {
            const recData = rec.data || {};
            return (
              <div key={rec.id} className="flex items-center gap-3 px-2 py-1.5 bg-card rounded-lg text-xs">
                <span className="text-muted-foreground">#{rec.id}</span>
                {relatedFields.map((f: any) => (
                  <span key={f.slug} className="truncate max-w-[150px]">{renderCellValue(recData[f.slug], f)}</span>
                ))}
              </div>
            );
          })}
          {relatedRecords.length > 5 && (
            <p className="text-xs text-muted-foreground text-center py-1">+{relatedRecords.length - 5} נוספים</p>
          )}
        </div>
      )}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
      <ActivityLog entityType="data-view" />
      <RelatedRecords entityType="data-view" />
    </div>
    </div>
  );
}
