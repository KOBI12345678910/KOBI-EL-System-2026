import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Edit2, Trash2, BarChart3, Table2, Download, PieChart, TrendingUp,
  Eye, X, ChevronDown, ChevronUp, GripVertical, AreaChart, Filter,
  Calculator, Paintbrush, FileSpreadsheet, FileJson, FileText, FileType
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell,
  AreaChart as RechartsArea, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from "recharts";

const API_BASE = "/api";

const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6", "#3b82f6", "#14b8a6"];

interface Report {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  entityId: number | null;
  queryConfig: any;
  columns: any[];
  aggregations: any[];
  grouping: any[];
  filters: any[];
  sorting: any[];
  calculatedFields: any[];
  displayType: string;
  chartConfig: any;
  conditionalFormatting?: any[];
  filterLogic?: string;
  scheduleConfig: any;
  scheduleEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Entity {
  id: number;
  name: string;
  slug: string;
  moduleId: number;
}

interface EntityField {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  fieldType: string;
}

const DISPLAY_TYPES = [
  { value: "table", label: "טבלה", icon: Table2 },
  { value: "bar_chart", label: "עמודות", icon: BarChart3 },
  { value: "pie_chart", label: "עוגה", icon: PieChart },
  { value: "line_chart", label: "קו", icon: TrendingUp },
  { value: "area_chart", label: "שטח", icon: AreaChart },
];

const AGG_TYPES = [
  { value: "count", label: "ספירה" },
  { value: "sum", label: "סכום" },
  { value: "avg", label: "ממוצע" },
  { value: "min", label: "מינימום" },
  { value: "max", label: "מקסימום" },
];

const FILTER_OPERATORS = [
  { value: "equals", label: "שווה" },
  { value: "not_equals", label: "לא שווה" },
  { value: "contains", label: "מכיל" },
  { value: "not_contains", label: "לא מכיל" },
  { value: "starts_with", label: "מתחיל ב-" },
  { value: "gt", label: "גדול מ-" },
  { value: "lt", label: "קטן מ-" },
  { value: "gte", label: "גדול/שווה ל-" },
  { value: "lte", label: "קטן/שווה ל-" },
  { value: "is_empty", label: "ריק" },
  { value: "is_not_empty", label: "לא ריק" },
];

const CF_OPERATORS = [
  { value: "gt", label: "גדול מ-" },
  { value: "lt", label: "קטן מ-" },
  { value: "gte", label: "גדול/שווה ל-" },
  { value: "lte", label: "קטן/שווה ל-" },
  { value: "equals", label: "שווה ל-" },
  { value: "between", label: "בין" },
  { value: "contains", label: "מכיל" },
];

export default function ReportBuilderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDesigner, setShowDesigner] = useState(false);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [livePreview, setLivePreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [search, setSearch] = useState("");

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["reports"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/platform/reports`);
      if (!r.ok) throw new Error("Failed to fetch reports");
      return r.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API_BASE}/platform/reports/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast({ title: "נמחק", description: "הדוח הוסר." });
    },
  });

  const handleExport = async (reportId: number, format: string) => {
    try {
      const r = await fetch(`${API_BASE}/bi/export/report/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!r.ok) {
        const legacy = await fetch(`${API_BASE}/platform/reports/${reportId}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format }),
        });
        if (!legacy.ok) throw new Error("Export failed");
        const text = await legacy.text();
        downloadBlob(text, format === "json" ? "application/json" : "text/csv", `report-${reportId}.${format}`);
        return;
      }
      if (format === "json") {
        const data = await r.json();
        downloadBlob(JSON.stringify(data, null, 2), "application/json", `report-${reportId}.json`);
      } else {
        const text = await r.text();
        const mime = format === "excel" ? "application/vnd.ms-excel" : format === "pdf" ? "text/plain" : "text/csv";
        const ext = format === "excel" ? "xls" : format === "pdf" ? "txt" : "csv";
        downloadBlob(text, mime, `report-${reportId}.${ext}`);
      }
      toast({ title: "ייצוא הושלם", description: `קובץ ${format.toUpperCase()} הורד.` });
    } catch {
      toast({ title: "שגיאה", description: "ייצוא נכשל." });
    }
  };

  function downloadBlob(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleLivePreview = async (reportId: number) => {
    setPreviewLoading(true);
    try {
      const r = await fetch(`${API_BASE}/platform/reports/${reportId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (r.ok) {
        const data = await r.json();
        setLivePreview(data);
      }
    } catch {
      toast({ title: "שגיאה", description: "טעינת תצוגה מקדימה נכשלה." });
    } finally {
      setPreviewLoading(false);
    }
  };

  const filtered = reports.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">בונה דוחות</h1>
          <p className="text-muted-foreground mt-1">עיצוב דוחות ויזואליים עם סינון, קיבוץ, פורמוט מותנה ותרשימים</p>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש דוחות..." className="w-48" />
          <Button onClick={() => { setEditingReport(null); setShowDesigner(true); }} className="gap-2">
            <Plus className="w-5 h-5" /> צור דוח
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-xl p-5 h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">אין דוחות</h3>
          <p className="text-sm text-muted-foreground mb-4">צור דוח ראשון כדי להתחיל לנתח את הנתונים</p>
          <Button onClick={() => { setEditingReport(null); setShowDesigner(true); }} className="gap-2"><Plus className="w-4 h-4" /> צור דוח</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(report => {
            const dt = DISPLAY_TYPES.find(d => d.value === report.displayType);
            const Icon = dt?.icon || Table2;
            return (
              <Card key={report.id} className="flex flex-col hover:border-primary/30 transition-colors">
                <div className="p-5 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{report.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{report.description || report.slug}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingReport(report); setShowDesigner(true); }} className="p-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק דוח זה?"); if (ok) deleteMutation.mutate(report.id); }} className="p-2 text-muted-foreground hover:text-destructive rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>}
                  </div>
                </div>
                <div className="px-5 pb-3 flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 font-semibold uppercase tracking-wider">
                    {dt?.label || report.displayType}
                  </span>
                  {(report.columns as any[])?.length > 0 && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                      {(report.columns as any[]).length} עמודות
                    </span>
                  )}
                  {(report.calculatedFields as any[])?.length > 0 && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-violet-500/10 text-violet-400 font-semibold">
                      <Calculator className="w-2.5 h-2.5 inline ml-0.5" />{(report.calculatedFields as any[]).length} מחושב
                    </span>
                  )}
                  {(report.conditionalFormatting as any[])?.length > 0 && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-orange-500/10 text-orange-400 font-semibold">
                      <Paintbrush className="w-2.5 h-2.5 inline ml-0.5" />פורמוט
                    </span>
                  )}
                </div>
                <div className="p-4 border-t border-border/30 flex justify-between items-center">
                  <button onClick={() => handleLivePreview(report.id)} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                    <Eye className="w-4 h-4" /> תצוגה חיה
                  </button>
                  <ExportMenu reportId={report.id} onExport={handleExport} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {livePreview && (
        <LivePreviewModal data={livePreview} loading={previewLoading} onClose={() => setLivePreview(null)} />
      )}

      {showDesigner && (
        <ReportDesigner
          report={editingReport}
          onClose={() => setShowDesigner(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["reports"] });
            setShowDesigner(false);
          }}
        />
      )}
    </div>
  );
}

function ExportMenu({ reportId, onExport }: { reportId: number; onExport: (id: number, fmt: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formats = [
    { id: "csv", label: "CSV", icon: FileText },
    { id: "excel", label: "Excel", icon: FileSpreadsheet },
    { id: "json", label: "JSON", icon: FileJson },
    { id: "pdf", label: "PDF", icon: FileType },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/20 hover:bg-muted/40 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
      >
        <Download className="w-3.5 h-3.5" /> ייצוא
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 bg-card border border-border rounded-xl shadow-2xl z-50 py-1 min-w-[120px]">
          {formats.map(fmt => (
            <button
              key={fmt.id}
              onClick={() => { onExport(reportId, fmt.id); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors"
            >
              <fmt.icon className="w-3.5 h-3.5" /> {fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LivePreviewModal({ data, loading, onClose }: { data: any; loading: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={true} onClose={onClose} title={`דוח: ${data.reportName}`}>
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">טוען נתונים...</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>סה״כ רשומות: <strong className="text-foreground">{data.totalRecords}</strong></span>
            <span>נוצר: {new Date(data.generatedAt).toLocaleString("he-IL")}</span>
          </div>
          {data.aggregations && Object.keys(data.aggregations).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(data.aggregations).map(([key, value]: [string, any]) => (
                <div key={key} className="bg-primary/5 rounded-xl p-3 border border-primary/10">
                  <p className="text-xs text-muted-foreground">{key}</p>
                  <p className="text-lg font-bold text-primary">{typeof value === "number" ? value.toLocaleString("he-IL") : value}</p>
                </div>
              ))}
            </div>
          )}
          <PreviewTable data={data} />
        </div>
      )}
    </Modal>
  );
}

function PreviewTable({ data }: { data: any }) {
  const rows = data.rows || [];
  const columns = data.columns || [];
  return (
    <div className="overflow-x-auto border border-border/30 rounded-xl max-h-96">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 bg-muted/10 sticky top-0">
            {columns.map((col: any) => (
              <th key={col.slug} className="p-3 text-right font-medium text-muted-foreground whitespace-nowrap">{col.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row: any, i: number) => (
            <tr key={i} className="border-b border-border/20 hover:bg-muted/5">
              {columns.map((col: any) => (
                <td key={col.slug} className="p-3 text-right whitespace-nowrap">{row[col.slug] ?? ""}</td>
              ))}
            </tr>
          ))}
          {rows.length > 100 && (
            <tr><td colSpan={columns.length} className="p-3 text-center text-muted-foreground text-xs">...ועוד {rows.length - 100} רשומות</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportDesigner({ report, onClose, onSaved }: { report: Report | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(report?.name || "");
  const [slug, setSlug] = useState(report?.slug || "");
  const [description, setDescription] = useState(report?.description || "");
  const [entityId, setEntityId] = useState<number | null>(report?.entityId || null);
  const [displayType, setDisplayType] = useState(report?.displayType || "table");
  const [columns, setColumns] = useState<any[]>((report?.columns as any[])?.length ? report!.columns : []);
  const [aggregations, setAggregations] = useState<any[]>((report?.aggregations as any[])?.length ? report!.aggregations : []);
  const [filters, setFilters] = useState<any[]>((report?.filters as any[])?.length ? report!.filters : []);
  const [filterLogic, setFilterLogic] = useState<string>(report?.filterLogic || "AND");
  const [grouping, setGrouping] = useState<any[]>((report?.grouping as any[])?.length ? report!.grouping : []);
  const [sorting, setSorting] = useState<any[]>((report?.sorting as any[])?.length ? report!.sorting : []);
  const [calculatedFields, setCalculatedFields] = useState<any[]>((report?.calculatedFields as any[])?.length ? report!.calculatedFields : []);
  const [conditionalFormatting, setConditionalFormatting] = useState<any[]>((report?.conditionalFormatting as any[])?.length ? report!.conditionalFormatting! : []);
  const [chartConfig, setChartConfig] = useState<any>(report?.chartConfig || {});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("columns");
  const [liveData, setLiveData] = useState<any>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const { modules: _reportModules } = usePlatformModules();

  const { data: entities = [] } = useQuery<Entity[]>({
    queryKey: ["all-entities-report", _reportModules.map((m: any) => m.id)],
    queryFn: async () => {
      const results = await Promise.allSettled(
        _reportModules.map((mod: any) => authFetch(`${API_BASE}/platform/modules/${mod.id}/entities`).then(r => r.ok ? r.json() : []))
      );
      return results.flatMap(r => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [])) as Entity[];
    },
    enabled: _reportModules.length > 0,
  });

  const { data: fields = [] } = useQuery<EntityField[]>({
    queryKey: ["entity-fields-report", entityId],
    queryFn: async () => {
      if (!entityId) return [];
      const r = await fetch(`${API_BASE}/platform/entities/${entityId}/fields`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!entityId,
  });

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleColumnDragStart = (idx: number) => { dragItem.current = idx; };
  const handleColumnDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleColumnDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const newCols = [...columns];
    const [dragged] = newCols.splice(dragItem.current, 1);
    newCols.splice(dragOverItem.current, 0, dragged);
    setColumns(newCols);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const addColumn = (fieldSlug: string) => {
    const field = fields.find(f => f.slug === fieldSlug);
    if (!field || columns.some(c => c.fieldSlug === fieldSlug)) return;
    setColumns([...columns, { fieldSlug: field.slug, label: field.name, fieldType: field.fieldType }]);
  };

  const removeColumn = (idx: number) => setColumns(columns.filter((_, i) => i !== idx));

  const updateColumnLabel = (idx: number, label: string) => {
    const c = [...columns]; c[idx] = { ...c[idx], label }; setColumns(c);
  };

  const addCalcField = () => setCalculatedFields([...calculatedFields, { name: "", formula: "", label: "" }]);
  const updateCalcField = (idx: number, key: string, val: string) => {
    const cf = [...calculatedFields]; cf[idx] = { ...cf[idx], [key]: val }; setCalculatedFields(cf);
  };
  const removeCalcField = (idx: number) => setCalculatedFields(calculatedFields.filter((_, i) => i !== idx));

  const addCF = () => setConditionalFormatting([...conditionalFormatting, { fieldSlug: "", operator: "gt", value: "", bgColor: "#ef4444", textColor: "#ffffff" }]);
  const updateCF = (idx: number, key: string, val: string) => {
    const cf = [...conditionalFormatting]; cf[idx] = { ...cf[idx], [key]: val }; setConditionalFormatting(cf);
  };
  const removeCF = (idx: number) => setConditionalFormatting(conditionalFormatting.filter((_, i) => i !== idx));

  const addFilter = () => setFilters([...filters, { fieldSlug: "", operator: "equals", value: "", logic: "AND" }]);
  const updateFilter = (idx: number, key: string, value: string) => {
    const f = [...filters]; f[idx] = { ...f[idx], [key]: value }; setFilters(f);
  };
  const removeFilter = (idx: number) => setFilters(filters.filter((_, i) => i !== idx));

  const addAggregation = () => setAggregations([...aggregations, { fieldSlug: "", function: "count", label: "" }]);
  const updateAggregation = (idx: number, key: string, value: string) => {
    const aggs = [...aggregations];
    aggs[idx] = { ...aggs[idx], [key]: value };
    if (key === "fieldSlug") {
      const field = fields.find(f => f.slug === value);
      if (field && !aggs[idx].label) aggs[idx].label = field.name;
    }
    setAggregations(aggs);
  };
  const removeAggregation = (idx: number) => setAggregations(aggregations.filter((_, i) => i !== idx));

  const addGrouping = () => setGrouping([...grouping, { fieldSlug: "" }]);
  const updateGrouping = (idx: number, value: string) => { const g = [...grouping]; g[idx] = { fieldSlug: value }; setGrouping(g); };
  const removeGrouping = (idx: number) => setGrouping(grouping.filter((_, i) => i !== idx));

  const addSorting = () => setSorting([...sorting, { fieldSlug: "", direction: "asc" }]);
  const updateSorting = (idx: number, key: string, value: string) => { const s = [...sorting]; s[idx] = { ...s[idx], [key]: value }; setSorting(s); };
  const removeSorting = (idx: number) => setSorting(sorting.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name,
        slug: slug || autoSlug(name),
        description: description || undefined,
        entityId: entityId || undefined,
        displayType,
        columns: columns.filter(c => c.fieldSlug),
        aggregations: aggregations.filter(a => a.fieldSlug || a.function === "count"),
        filters: filters.filter(f => f.fieldSlug),
        filterLogic,
        grouping: grouping.filter(g => g.fieldSlug),
        sorting: sorting.filter(s => s.fieldSlug),
        calculatedFields: calculatedFields.filter(cf => cf.name && cf.formula),
        conditionalFormatting: conditionalFormatting.filter(cf => cf.fieldSlug),
        chartConfig,
        isActive: true,
      };
      const url = report ? `${API_BASE}/platform/reports/${report.id}` : `${API_BASE}/platform/reports`;
      const method = report ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("Failed to save report");
      toast({ title: report ? "עודכן" : "נוצר", description: "הדוח נשמר בהצלחה." });
      onSaved();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err?.message || "שמירה נכשלה" });
    } finally {
      setSaving(false);
    }
  };

  const loadLivePreview = async () => {
    if (!report?.id) { toast({ title: "הערה", description: "שמור את הדוח תחילה." }); return; }
    setLiveLoading(true);
    try {
      const r = await fetch(`${API_BASE}/platform/reports/${report.id}/generate`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (r.ok) setLiveData(await r.json());
    } catch {} finally { setLiveLoading(false); }
  };

  const TABS = [
    { id: "columns", label: "עמודות", count: columns.length },
    { id: "filters", label: "סינונים", count: filters.length },
    { id: "grouping", label: "קיבוץ", count: grouping.length },
    { id: "aggregations", label: "סיכומים", count: aggregations.length },
    { id: "sorting", label: "מיון", count: sorting.length },
    { id: "calcfields", label: "שדות מחושבים", count: calculatedFields.length },
    { id: "formatting", label: "פורמוט מותנה", count: conditionalFormatting.length },
    { id: "chart", label: "הגדרות תרשים", count: 0 },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-7xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">{report ? "עריכת דוח" : "דוח חדש"}</h2>
          <div className="flex items-center gap-2">
            {report && (
              <button onClick={loadLivePreview} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20">
                <Eye className="w-4 h-4" /> תצוגה חיה
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="flex gap-0 min-h-full">
            <div className="w-[55%] p-4 space-y-3 border-l border-border overflow-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>שם הדוח</Label>
                  <Input value={name} onChange={e => { setName(e.target.value); if (!report) setSlug(autoSlug(e.target.value)); }} placeholder="דוח מכירות חודשי" />
                </div>
                <div>
                  <Label>מזהה</Label>
                  <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="monthly-sales" dir="ltr" className="text-left" />
                </div>
              </div>

              <div>
                <Label>תיאור</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור הדוח..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ישות מקור</Label>
                  <select
                    value={entityId || ""}
                    onChange={e => { const newId = e.target.value ? Number(e.target.value) : null; setEntityId(newId); setColumns([]); setAggregations([]); setFilters([]); setGrouping([]); setSorting([]); }}
                    className="w-full h-12 rounded-xl border-2 border-border bg-background/50 px-3 text-sm"
                  >
                    <option value="">בחר ישות...</option>
                    {entities.map(ent => <option key={ent.id} value={ent.id}>{ent.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>סוג תצוגה</Label>
                  <div className="grid grid-cols-5 gap-1">
                    {DISPLAY_TYPES.map(dt => (
                      <button key={dt.value} type="button" onClick={() => setDisplayType(dt.value)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${displayType === dt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                        <dt.icon className="w-4 h-4" />
                        <span className="text-[9px] font-medium">{dt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border border-border/50 rounded-xl overflow-hidden">
                <div className="flex overflow-x-auto border-b border-border/50 bg-muted/5">
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                      {tab.label}
                      {tab.count > 0 && <span className="px-1 py-0.5 text-[10px] bg-primary/15 text-primary rounded">{tab.count}</span>}
                    </button>
                  ))}
                </div>

                <div className="p-3">
                  {activeTab === "columns" && (
                    <div className="space-y-2">
                      {entityId && fields.length > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground mb-2">לחץ על שדה להוספה/הסרה:</p>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {fields.map(f => {
                              const isSelected = columns.some(c => c.fieldSlug === f.slug);
                              return (
                                <button key={f.slug} onClick={() => isSelected ? removeColumn(columns.findIndex(c => c.fieldSlug === f.slug)) : addColumn(f.slug)}
                                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${isSelected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                                  {f.name}
                                </button>
                              );
                            })}
                          </div>
                          {columns.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">גרור לשינוי סדר:</p>
                              {columns.map((col, i) => (
                                <div key={i}
                                  draggable
                                  onDragStart={() => handleColumnDragStart(i)}
                                  onDragEnter={() => handleColumnDragEnter(i)}
                                  onDragEnd={handleColumnDragEnd}
                                  onDragOver={e => e.preventDefault()}
                                  className="flex items-center gap-2 bg-muted/10 rounded-lg px-3 py-1.5 cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                                  <span className="text-xs font-medium flex-1 text-muted-foreground">{col.fieldSlug}</span>
                                  <input value={col.label || ""} onChange={e => updateColumnLabel(i, e.target.value)} placeholder="תווית מותאמת" className="w-32 px-2 py-1 text-xs bg-background border border-border rounded-lg" />
                                  <button onClick={() => removeColumn(i)} className="text-destructive hover:bg-destructive/10 p-1 rounded"><X className="w-3 h-3" /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : <p className="text-xs text-muted-foreground">בחר ישות מקור כדי לראות שדות</p>}
                    </div>
                  )}

                  {activeTab === "filters" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-muted-foreground">לוגיקה:</span>
                        <div className="flex rounded-lg border border-border overflow-hidden">
                          {["AND", "OR"].map(lg => (
                            <button key={lg} onClick={() => setFilterLogic(lg)}
                              className={`px-3 py-1 text-xs font-medium transition-colors ${filterLogic === lg ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                              {lg === "AND" ? "הכל (AND)" : "אחד (OR)"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {filters.map((filter, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {i > 0 && <span className="text-xs text-primary font-bold w-6 shrink-0">{filterLogic}</span>}
                          {i === 0 && <span className="text-xs text-muted-foreground w-6 shrink-0">כאשר</span>}
                          <select value={filter.fieldSlug} onChange={e => updateFilter(i, "fieldSlug", e.target.value)} className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                            <option value="">בחר שדה...</option>
                            <option value="_status">סטטוס</option>
                            {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                          </select>
                          <select value={filter.operator} onChange={e => updateFilter(i, "operator", e.target.value)} className="w-28 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                            {FILTER_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                          </select>
                          {!["is_empty", "is_not_empty"].includes(filter.operator) && (
                            <input value={filter.value} onChange={e => updateFilter(i, "value", e.target.value)} placeholder="ערך" className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-xs" />
                          )}
                          <button onClick={() => removeFilter(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button onClick={addFilter} className="text-xs text-primary hover:text-primary/80 font-medium">+ הוסף סינון</button>
                    </div>
                  )}

                  {activeTab === "grouping" && (
                    <div className="space-y-2">
                      {grouping.map((g, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select value={g.fieldSlug} onChange={e => updateGrouping(i, e.target.value)} className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                            <option value="">בחר שדה לקיבוץ...</option>
                            <option value="_status">סטטוס</option>
                            {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                          </select>
                          <button onClick={() => removeGrouping(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button onClick={addGrouping} className="text-xs text-primary hover:text-primary/80 font-medium">+ הוסף קיבוץ</button>
                    </div>
                  )}

                  {activeTab === "aggregations" && (
                    <div className="space-y-2">
                      {aggregations.map((agg, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select value={agg.function || "count"} onChange={e => updateAggregation(i, "function", e.target.value)} className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                            {AGG_TYPES.map(at => <option key={at.value} value={at.value}>{at.label}</option>)}
                          </select>
                          <select value={agg.fieldSlug} onChange={e => updateAggregation(i, "fieldSlug", e.target.value)} className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                            <option value="">בחר שדה...</option>
                            {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                          </select>
                          <input value={agg.label || ""} onChange={e => updateAggregation(i, "label", e.target.value)} placeholder="תווית" className="w-28 h-9 rounded-lg border border-border bg-background px-2 text-xs" />
                          <button onClick={() => removeAggregation(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button onClick={addAggregation} className="text-xs text-primary hover:text-primary/80 font-medium">+ הוסף סיכום</button>
                    </div>
                  )}

                  {activeTab === "sorting" && (
                    <div className="space-y-2">
                      {sorting.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select value={s.fieldSlug} onChange={e => updateSorting(i, "fieldSlug", e.target.value)} className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                            <option value="">בחר שדה...</option>
                            {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                          </select>
                          <select value={s.direction} onChange={e => updateSorting(i, "direction", e.target.value)} className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                            <option value="asc">עולה</option>
                            <option value="desc">יורד</option>
                          </select>
                          <button onClick={() => removeSorting(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button onClick={addSorting} className="text-xs text-primary hover:text-primary/80 font-medium">+ הוסף מיון</button>
                    </div>
                  )}

                  {activeTab === "calcfields" && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">הגדר שדות מחושבים עם נוסחאות. השתמש בשמות שדות כגון: {"{{field_slug}} * 1.17"}</p>
                      {calculatedFields.map((cf, i) => (
                        <div key={i} className="space-y-2 bg-muted/10 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <input value={cf.name} onChange={e => updateCalcField(i, "name", e.target.value)} placeholder="שם שדה (slug)" dir="ltr" className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs" />
                            <input value={cf.label} onChange={e => updateCalcField(i, "label", e.target.value)} placeholder="תווית להצגה" className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs" />
                            <button onClick={() => removeCalcField(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><X className="w-3 h-3" /></button>
                          </div>
                          <input value={cf.formula} onChange={e => updateCalcField(i, "formula", e.target.value)} placeholder={`נוסחה: {{price}} * {{quantity}}`} dir="ltr" className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs font-mono" />
                        </div>
                      ))}
                      <button onClick={addCalcField} className="text-xs text-primary hover:text-primary/80 font-medium">+ הוסף שדה מחושב</button>
                    </div>
                  )}

                  {activeTab === "formatting" && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">הגדר צביעה מותנית של תאים על פי ערכי שדות</p>
                      {conditionalFormatting.map((cf, i) => (
                        <div key={i} className="space-y-2 bg-muted/10 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <select value={cf.fieldSlug} onChange={e => updateCF(i, "fieldSlug", e.target.value)} className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                              <option value="">בחר שדה...</option>
                              {[...columns, ...calculatedFields.map(cf => ({ fieldSlug: cf.name, label: cf.label || cf.name }))].map((c: any) => (
                                <option key={c.fieldSlug || c.name} value={c.fieldSlug || c.name}>{c.label || c.fieldSlug || c.name}</option>
                              ))}
                            </select>
                            <select value={cf.operator} onChange={e => updateCF(i, "operator", e.target.value)} className="w-28 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                              {CF_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                            </select>
                            <input value={cf.value} onChange={e => updateCF(i, "value", e.target.value)} placeholder="ערך" className="w-20 h-9 rounded-lg border border-border bg-background px-2 text-xs" />
                            <button onClick={() => removeCF(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><X className="w-3 h-3" /></button>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground">רקע:</label>
                            <input type="color" value={cf.bgColor || "#ef4444"} onChange={e => updateCF(i, "bgColor", e.target.value)} className="w-8 h-7 rounded border border-border cursor-pointer" />
                            <label className="text-xs text-muted-foreground">טקסט:</label>
                            <input type="color" value={cf.textColor || "#ffffff"} onChange={e => updateCF(i, "textColor", e.target.value)} className="w-8 h-7 rounded border border-border cursor-pointer" />
                            <div className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: cf.bgColor || "#ef4444", color: cf.textColor || "#ffffff" }}>
                              דוגמה
                            </div>
                          </div>
                        </div>
                      ))}
                      <button onClick={addCF} className="text-xs text-primary hover:text-primary/80 font-medium">+ הוסף כלל פורמוט</button>
                    </div>
                  )}

                  {activeTab === "chart" && (
                    <div className="space-y-3">
                      <div>
                        <Label>שדה ציר X (מחרוזת/קטגוריה)</Label>
                        <select value={chartConfig.xAxisField || ""} onChange={e => setChartConfig({ ...chartConfig, xAxisField: e.target.value })} className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm">
                          <option value="">בחר שדה...</option>
                          {columns.map((c: any) => <option key={c.fieldSlug} value={c.fieldSlug}>{c.label || c.fieldSlug}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>שדה ציר Y (מספרי)</Label>
                        <select value={chartConfig.yAxisField || ""} onChange={e => setChartConfig({ ...chartConfig, yAxisField: e.target.value })} className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm">
                          <option value="">בחר שדה...</option>
                          {[...columns, ...aggregations.map(a => ({ fieldSlug: a.label || `${a.function}_${a.fieldSlug}`, label: a.label }))].map((c: any) => (
                            <option key={c.fieldSlug} value={c.fieldSlug}>{c.label || c.fieldSlug}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                          <input type="checkbox" checked={!!chartConfig.showLegend} onChange={e => setChartConfig({ ...chartConfig, showLegend: e.target.checked })} className="rounded" />
                          הצג מקרא
                        </label>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                          <input type="checkbox" checked={!!chartConfig.showGrid} onChange={e => setChartConfig({ ...chartConfig, showGrid: e.target.checked })} className="rounded" />
                          הצג רשת
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-[45%] p-4 overflow-auto bg-muted/5">
              <h3 className="text-sm font-semibold mb-3">תצוגה מקדימה</h3>
              {liveData ? (
                <LiveDataPreview data={liveData} displayType={displayType} chartConfig={chartConfig} conditionalFormatting={conditionalFormatting} />
              ) : liveLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Eye className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">שמור את הדוח ולחץ ״תצוגה חיה״</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
          <Button onClick={handleSave} disabled={saving || !name}>
            {saving ? "שומר..." : "שמור דוח"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LiveDataPreview({ data, displayType, chartConfig, conditionalFormatting }: {
  data: any; displayType: string; chartConfig: any; conditionalFormatting: any[];
}) {
  const rows = data.rows || [];
  const columns = data.columns || [];

  const getCellStyle = (col: any, value: any) => {
    for (const cf of conditionalFormatting || []) {
      if (cf.fieldSlug !== col.slug) continue;
      const num = parseFloat(value);
      let match = false;
      if (cf.operator === "gt" && num > parseFloat(cf.value)) match = true;
      else if (cf.operator === "lt" && num < parseFloat(cf.value)) match = true;
      else if (cf.operator === "gte" && num >= parseFloat(cf.value)) match = true;
      else if (cf.operator === "lte" && num <= parseFloat(cf.value)) match = true;
      else if (cf.operator === "equals" && String(value) === String(cf.value)) match = true;
      else if (cf.operator === "contains" && String(value).includes(cf.value)) match = true;
      if (match) return { backgroundColor: cf.bgColor, color: cf.textColor };
    }
    return {};
  };

  if (displayType !== "table" && rows.length > 0 && chartConfig.xAxisField && chartConfig.yAxisField) {
    const chartData = rows.slice(0, 50).map((row: any) => ({
      name: row[chartConfig.xAxisField] ?? "",
      value: parseFloat(row[chartConfig.yAxisField]) || 0,
    }));

    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {displayType === "bar_chart" ? (
            <BarChart data={chartData}>
              {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#333" />}
              <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
              {chartConfig.showLegend && <Legend />}
              <Bar dataKey="value" fill={CHART_COLORS[0]} />
            </BarChart>
          ) : displayType === "line_chart" ? (
            <LineChart data={chartData}>
              {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#333" />}
              <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
              {chartConfig.showLegend && <Legend />}
              <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} />
            </LineChart>
          ) : displayType === "area_chart" ? (
            <RechartsArea data={chartData}>
              {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#333" />}
              <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
              {chartConfig.showLegend && <Legend />}
              <Area type="monotone" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0] + "33"} />
            </RechartsArea>
          ) : (
            <RechartsPie>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {chartData.map((_: any, index: number) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
              {chartConfig.showLegend && <Legend />}
            </RechartsPie>
          )}
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border/30 rounded-lg max-h-80">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 bg-muted/10">
            {columns.map((col: any) => <th key={col.slug} className="p-2 text-right font-medium text-muted-foreground whitespace-nowrap">{col.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((row: any, i: number) => (
            <tr key={i} className="border-b border-border/20 hover:bg-muted/5">
              {columns.map((col: any) => (
                <td key={col.slug} className="p-2 text-right whitespace-nowrap" style={getCellStyle(col, row[col.slug])}>{row[col.slug] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
