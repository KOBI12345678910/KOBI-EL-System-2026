import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import { authFetch } from "@/lib/utils";
import {
  Plus, Edit2, Trash2, BarChart3, Table2, Download, PieChart, TrendingUp,
  Eye, Filter, Layers, X, ChevronDown, ChevronUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";

const API_BASE = "/api";

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
  { value: "bar_chart", label: "תרשים עמודות", icon: BarChart3 },
  { value: "pie_chart", label: "תרשים עוגה", icon: PieChart },
  { value: "line_chart", label: "תרשים קו", icon: TrendingUp },
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
  { value: "gte", label: "גדול או שווה ל-" },
  { value: "lte", label: "קטן או שווה ל-" },
  { value: "is_empty", label: "ריק" },
  { value: "is_not_empty", label: "לא ריק" },
];

export default function ReportBuilderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDesigner, setShowDesigner] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [livePreview, setLivePreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  const handleExportCsv = async (reportId: number) => {
    try {
      const r = await fetch(`${API_BASE}/platform/reports/${reportId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "csv" }),
      });
      if (!r.ok) throw new Error("Export failed");
      const text = await r.text();
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${reportId}-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ייצוא הושלם", description: "קובץ CSV הורד בהצלחה." });
    } catch {
      toast({ title: "שגיאה", description: "ייצוא נכשל." });
    }
  };

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

  const openCreate = () => {
    setEditingReport(null);
    setShowDesigner(true);
  };

  const openEdit = (report: Report) => {
    setEditingReport(report);
    setShowDesigner(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-white">בונה דוחות</h1>
          <p className="text-muted-foreground mt-1">
            יצירת דוחות מותאמים עם סיכומים, קיבוצים, סינונים ותצוגת נתונים חיה
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-5 h-5" /> צור דוח חדש
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted/20" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-2/3 rounded bg-muted/20" />
                  <div className="h-3 w-1/2 rounded bg-muted/15" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-muted/10" />
              <div className="h-3 w-3/4 rounded bg-muted/10" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card className="p-12 text-center">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">אין דוחות במערכת</h3>
          <p className="text-sm text-muted-foreground mb-4">צור דוח ראשון כדי להתחיל לנתח את הנתונים</p>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> צור דוח</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map(report => {
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
                      <h3 className="font-bold text-white">{report.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{report.description || report.slug}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(report)} className="p-2 text-muted-foreground hover:bg-card/10 hover:text-white rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={async () => { if (globalConfirm("למחוק דוח זה?")) deleteMutation.mutate(report.id); }} className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                  {(report.aggregations as any[])?.length > 0 && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 font-semibold">
                      {(report.aggregations as any[]).length} סיכומים
                    </span>
                  )}
                  {report.entityId && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-purple-500/10 text-purple-400 font-semibold">
                      ישות מקושרת
                    </span>
                  )}
                </div>
                <div className="p-4 border-t border-border/30 flex justify-between items-center">
                  <button
                    onClick={() => handleLivePreview(report.id)}
                    className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    <Eye className="w-4 h-4" /> תצוגה חיה
                  </button>
                  <button
                    onClick={() => handleExportCsv(report.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/20 hover:bg-muted/40 rounded-lg text-muted-foreground hover:text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {livePreview && (
        <LivePreviewModal
          data={livePreview}
          loading={previewLoading}
          onClose={() => setLivePreview(null)}
        />
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

function LivePreviewModal({ data, loading, onClose }: { data: any; loading: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={true} onClose={onClose} title={`דוח: ${data.reportName}`}>
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">טוען נתונים...</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>סה״כ רשומות: <strong className="text-white">{data.totalRecords}</strong></span>
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

          {data.groupedData ? (
            <div className="space-y-4">
              {data.groupedData.map((group: any) => (
                <div key={group.group} className="border border-border/30 rounded-xl overflow-hidden">
                  <div className="bg-muted/10 px-4 py-2 flex items-center justify-between">
                    <span className="font-medium text-sm">{group.group}</span>
                    <span className="text-xs text-muted-foreground">{group.count} רשומות</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          {data.columns?.map((col: any) => (
                            <th key={col.slug} className="p-2 text-right font-medium text-muted-foreground">{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.slice(0, 10).map((row: any, i: number) => (
                          <tr key={i} className="border-b border-border/20 hover:bg-muted/5">
                            {data.columns?.map((col: any) => (
                              <td key={col.slug} className="p-2 text-right">{row[col.slug] ?? ""}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto border border-border/30 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/10">
                    {data.columns?.map((col: any) => (
                      <th key={col.slug} className="p-3 text-right font-medium text-muted-foreground">{col.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows?.slice(0, 50).map((row: any, i: number) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/5">
                      {data.columns?.map((col: any) => (
                        <td key={col.slug} className="p-3 text-right">{row[col.slug] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                  {data.rows?.length > 50 && (
                    <tr>
                      <td colSpan={data.columns?.length || 1} className="p-3 text-center text-muted-foreground">
                        ...ועוד {data.rows.length - 50} רשומות
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ReportDesigner({
  report,
  onClose,
  onSaved,
}: {
  report: Report | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(report?.name || "");
  const [slug, setSlug] = useState(report?.slug || "");
  const [description, setDescription] = useState(report?.description || "");
  const [entityId, setEntityId] = useState<number | null>(report?.entityId || null);
  const [displayType, setDisplayType] = useState(report?.displayType || "table");
  const [columns, setColumns] = useState<any[]>(
    (report?.columns as any[])?.length ? report!.columns : []
  );
  const [aggregations, setAggregations] = useState<any[]>(
    (report?.aggregations as any[])?.length ? report!.aggregations : []
  );
  const [filters, setFilters] = useState<any[]>(
    (report?.filters as any[])?.length ? report!.filters : []
  );
  const [grouping, setGrouping] = useState<any[]>(
    (report?.grouping as any[])?.length ? report!.grouping : []
  );
  const [sorting, setSorting] = useState<any[]>(
    (report?.sorting as any[])?.length ? report!.sorting : []
  );
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("columns");
  const [liveData, setLiveData] = useState<any>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const { data: entities = [] } = useQuery<Entity[]>({
    queryKey: ["all-entities-report"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/platform/modules`);
      if (!r.ok) return [];
      const modules = await r.json();
      const allEntities: Entity[] = [];
      for (const mod of modules) {
        const er = await fetch(`${API_BASE}/platform/modules/${mod.id}/entities`);
        if (er.ok) {
          const ents = await er.json();
          allEntities.push(...ents);
        }
      }
      return allEntities;
    },
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

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const addColumn = (fieldSlug: string) => {
    const field = fields.find(f => f.slug === fieldSlug);
    if (!field || columns.some(c => c.fieldSlug === fieldSlug)) return;
    setColumns([...columns, { fieldSlug: field.slug, label: field.name, fieldType: field.fieldType }]);
  };

  const removeColumn = (idx: number) => {
    setColumns(columns.filter((_, i) => i !== idx));
  };

  const addAggregation = () => {
    setAggregations([...aggregations, { fieldSlug: "", function: "count", label: "" }]);
  };

  const updateAggregation = (idx: number, key: string, value: string) => {
    const aggs = [...aggregations];
    aggs[idx] = { ...aggs[idx], [key]: value };
    if (key === "fieldSlug") {
      const field = fields.find(f => f.slug === value);
      if (field && !aggs[idx].label) aggs[idx].label = field.name;
    }
    setAggregations(aggs);
  };

  const removeAggregation = (idx: number) => {
    setAggregations(aggregations.filter((_, i) => i !== idx));
  };

  const addFilter = () => {
    setFilters([...filters, { fieldSlug: "", operator: "equals", value: "" }]);
  };

  const updateFilter = (idx: number, key: string, value: string) => {
    const f = [...filters];
    f[idx] = { ...f[idx], [key]: value };
    setFilters(f);
  };

  const removeFilter = (idx: number) => {
    setFilters(filters.filter((_, i) => i !== idx));
  };

  const addGrouping = () => {
    setGrouping([...grouping, { fieldSlug: "" }]);
  };

  const updateGrouping = (idx: number, value: string) => {
    const g = [...grouping];
    g[idx] = { fieldSlug: value };
    setGrouping(g);
  };

  const removeGrouping = (idx: number) => {
    setGrouping(grouping.filter((_, i) => i !== idx));
  };

  const addSorting = () => {
    setSorting([...sorting, { fieldSlug: "", direction: "asc" }]);
  };

  const updateSorting = (idx: number, key: string, value: string) => {
    const s = [...sorting];
    s[idx] = { ...s[idx], [key]: value };
    setSorting(s);
  };

  const removeSorting = (idx: number) => {
    setSorting(sorting.filter((_, i) => i !== idx));
  };

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
        grouping: grouping.filter(g => g.fieldSlug),
        sorting: sorting.filter(s => s.fieldSlug),
        isActive: true,
      };

      const url = report
        ? `${API_BASE}/platform/reports/${report.id}`
        : `${API_BASE}/platform/reports`;
      const method = report ? "PUT" : "POST";

      const r = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
    if (!report?.id) {
      toast({ title: "הערה", description: "שמור את הדוח תחילה כדי לצפות בנתונים חיים." });
      return;
    }
    setLiveLoading(true);
    try {
      const r = await fetch(`${API_BASE}/platform/reports/${report.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (r.ok) setLiveData(await r.json());
    } catch {} finally {
      setLiveLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">{report ? "עריכת דוח" : "דוח חדש"}</h2>
          <div className="flex items-center gap-2">
            {report && (
              <button
                onClick={loadLivePreview}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20"
              >
                <Eye className="w-4 h-4" /> תצוגה חיה
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="flex gap-0 min-h-full">
            <div className="w-[55%] p-4 space-y-3 border-l border-border overflow-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>שם הדוח</Label>
                  <Input
                    value={name}
                    onChange={e => { setName(e.target.value); if (!report) setSlug(autoSlug(e.target.value)); }}
                    placeholder="דוח מכירות חודשי"
                  />
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>ישות מקור</Label>
                  <select
                    value={entityId || ""}
                    onChange={e => {
                      const newId = e.target.value ? Number(e.target.value) : null;
                      setEntityId(newId);
                      setColumns([]);
                      setAggregations([]);
                      setFilters([]);
                      setGrouping([]);
                      setSorting([]);
                    }}
                    className="w-full h-12 rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
                  >
                    <option value="">בחר ישות...</option>
                    {entities.map(ent => (
                      <option key={ent.id} value={ent.id}>{ent.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>סוג תצוגה</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                    {DISPLAY_TYPES.map(dt => (
                      <button
                        key={dt.value}
                        type="button"
                        onClick={() => setDisplayType(dt.value)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                          displayType === dt.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-border/80 text-muted-foreground"
                        }`}
                      >
                        <dt.icon className="w-4 h-4" />
                        <span className="text-[10px] font-medium">{dt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <CollapsibleSection title="עמודות" count={columns.length} expanded={expandedSection === "columns"} onToggle={() => toggleSection("columns")}>
                {entityId && fields.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {fields.map(f => {
                        const isSelected = columns.some(c => c.fieldSlug === f.slug);
                        return (
                          <button
                            key={f.slug}
                            onClick={() => isSelected ? removeColumn(columns.findIndex(c => c.fieldSlug === f.slug)) : addColumn(f.slug)}
                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            {f.name}
                          </button>
                        );
                      })}
                    </div>
                    {columns.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <p className="text-xs text-muted-foreground">עמודות נבחרות (גרור לשינוי סדר):</p>
                        {columns.map((col, i) => (
                          <div key={i} className="flex items-center gap-2 bg-muted/10 rounded-lg px-3 py-1.5">
                            <span className="text-xs font-medium flex-1">{col.label || col.fieldSlug}</span>
                            <input
                              value={col.label || ""}
                              onChange={e => {
                                const c = [...columns];
                                c[i] = { ...c[i], label: e.target.value };
                                setColumns(c);
                              }}
                              placeholder="תווית מותאמת"
                              className="w-32 px-2 py-1 text-xs bg-background border border-border rounded-lg"
                            />
                            <button onClick={() => removeColumn(i)} className="text-destructive hover:bg-destructive/10 p-1 rounded">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">בחר ישות מקור כדי לראות שדות זמינים</p>
                )}
              </CollapsibleSection>

              <CollapsibleSection title="סינונים" count={filters.length} expanded={expandedSection === "filters"} onToggle={() => toggleSection("filters")}>
                <div className="space-y-2">
                  {filters.map((filter, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={filter.fieldSlug}
                        onChange={e => updateFilter(i, "fieldSlug", e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="">בחר שדה...</option>
                        <option value="_status">סטטוס</option>
                        {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                      </select>
                      <select
                        value={filter.operator}
                        onChange={e => updateFilter(i, "operator", e.target.value)}
                        className="w-28 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        {FILTER_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                      </select>
                      {!["is_empty", "is_not_empty"].includes(filter.operator) && (
                        <input
                          value={filter.value}
                          onChange={e => updateFilter(i, "value", e.target.value)}
                          placeholder="ערך"
                          className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                        />
                      )}
                      <button onClick={() => removeFilter(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addFilter} className="text-xs text-primary hover:text-primary/80 font-medium">
                    + הוסף סינון
                  </button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="קיבוצים (Grouping)" count={grouping.length} expanded={expandedSection === "grouping"} onToggle={() => toggleSection("grouping")}>
                <div className="space-y-2">
                  {grouping.map((g, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={g.fieldSlug}
                        onChange={e => updateGrouping(i, e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="">בחר שדה...</option>
                        <option value="_status">סטטוס</option>
                        {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                      </select>
                      <button onClick={() => removeGrouping(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addGrouping} className="text-xs text-primary hover:text-primary/80 font-medium">
                    + הוסף קיבוץ
                  </button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="סיכומים (Aggregations)" count={aggregations.length} expanded={expandedSection === "aggregations"} onToggle={() => toggleSection("aggregations")}>
                <div className="space-y-2">
                  {aggregations.map((agg, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={agg.function || "count"}
                        onChange={e => updateAggregation(i, "function", e.target.value)}
                        className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        {AGG_TYPES.map(at => <option key={at.value} value={at.value}>{at.label}</option>)}
                      </select>
                      <select
                        value={agg.fieldSlug}
                        onChange={e => updateAggregation(i, "fieldSlug", e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="">בחר שדה...</option>
                        {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                      </select>
                      <input
                        value={agg.label || ""}
                        onChange={e => updateAggregation(i, "label", e.target.value)}
                        placeholder="תווית"
                        className="w-28 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      />
                      <button onClick={() => removeAggregation(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addAggregation} className="text-xs text-primary hover:text-primary/80 font-medium">
                    + הוסף סיכום
                  </button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="מיון" count={sorting.length} expanded={expandedSection === "sorting"} onToggle={() => toggleSection("sorting")}>
                <div className="space-y-2">
                  {sorting.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={s.fieldSlug}
                        onChange={e => updateSorting(i, "fieldSlug", e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="">בחר שדה...</option>
                        {fields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                      </select>
                      <select
                        value={s.direction}
                        onChange={e => updateSorting(i, "direction", e.target.value)}
                        className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="asc">עולה</option>
                        <option value="desc">יורד</option>
                      </select>
                      <button onClick={() => removeSorting(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addSorting} className="text-xs text-primary hover:text-primary/80 font-medium">
                    + הוסף מיון
                  </button>
                </div>
              </CollapsibleSection>
            </div>

            <div className="w-[45%] p-4 overflow-auto bg-muted/5">
              <h3 className="text-sm font-semibold mb-3">תצוגת דוח חיה</h3>
              {liveData ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>סה״כ: <strong>{liveData.totalRecords}</strong> רשומות</span>
                  </div>
                  {liveData.aggregations && Object.keys(liveData.aggregations).length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(liveData.aggregations).map(([key, value]: [string, any]) => (
                        <div key={key} className="bg-primary/5 rounded-lg p-2 border border-primary/10">
                          <p className="text-[10px] text-muted-foreground">{key}</p>
                          <p className="text-sm font-bold text-primary">{typeof value === "number" ? value.toLocaleString("he-IL") : value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="overflow-x-auto border border-border/30 rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/10">
                          {liveData.columns?.map((col: any) => (
                            <th key={col.slug} className="p-2 text-right font-medium text-muted-foreground whitespace-nowrap">{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveData.rows?.slice(0, 20).map((row: any, i: number) => (
                          <tr key={i} className="border-b border-border/20 hover:bg-muted/5">
                            {liveData.columns?.map((col: any) => (
                              <td key={col.slug} className="p-2 text-right whitespace-nowrap">{row[col.slug] ?? ""}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {liveData.rows?.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center">...ועוד {liveData.rows.length - 20} רשומות</p>
                  )}
                </div>
              ) : liveLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Eye className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">שמור את הדוח ולחץ ״תצוגה חיה״ לצפייה בנתונים אמיתיים</p>
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

function CollapsibleSection({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {count > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded-md font-semibold">{count}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && <div className="p-3">{children}</div>}
    </div>
  );
}
