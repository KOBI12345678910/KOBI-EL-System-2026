import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { authFetch } from "@/lib/utils";
import {
  Plus, Edit2, Trash2, BarChart3, Table2, X, Settings, GripVertical,
  LayoutDashboard, ArrowLeft, AreaChart, TrendingUp, SquareActivity,
  Maximize2, Minimize2, Save, Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart as RechartsArea, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";

const API_BASE = "/api";
const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6"];

const WIDGET_TYPES = [
  { value: "kpi", label: "KPI כרטיס", icon: SquareActivity },
  { value: "chart", label: "תרשים", icon: BarChart3 },
  { value: "table", label: "טבלה", icon: Table2 },
  { value: "metric", label: "מדד", icon: TrendingUp },
];

const CHART_SUBTYPES = [
  { value: "bar", label: "עמודות" },
  { value: "line", label: "קו" },
  { value: "pie", label: "עוגה" },
  { value: "area", label: "שטח" },
];

interface Dashboard {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  layoutConfig: any;
  roleAssignments: any[];
  isDefault: boolean;
  isPublic: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  widgets?: Widget[];
}

interface Widget {
  id: number;
  dashboardId: number;
  widgetType: string;
  title: string;
  reportId: number | null;
  dataSourceConfig: any;
  displayConfig: any;
  positionX: number;
  positionY: number;
  sizeW: number;
  sizeH: number;
}

const ROLES = ["מנהל", "מנהל כספים", "מנהל מכירות", "מנהל HR", "מנהל ייצור", "עובד"];

export default function CustomDashboards() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingDashboard, setEditingDashboard] = useState<Dashboard | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [viewMode, setViewMode] = useState<"list" | "designer">("list");
  const [search, setSearch] = useState("");

  const { data: dashboards = [], isLoading } = useQuery<Dashboard[]>({
    queryKey: ["bi-dashboards"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bi/dashboards`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API_BASE}/bi/dashboards/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bi-dashboards"] });
      toast({ title: "נמחק", description: "הדשבורד הוסר." });
    },
  });

  const handleOpenDesigner = async (dashboard: Dashboard) => {
    const r = await fetch(`${API_BASE}/bi/dashboards/${dashboard.id}`);
    if (r.ok) {
      const data = await r.json();
      setEditingDashboard(data);
    } else {
      setEditingDashboard(dashboard);
    }
    setViewMode("designer");
  };

  const handleCreateNew = () => {
    setEditingDashboard(null);
    setViewMode("designer");
  };

  const filtered = dashboards.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  if (viewMode === "designer") {
    return (
      <DashboardDesigner
        dashboard={editingDashboard}
        onBack={() => {
          setViewMode("list");
          queryClient.invalidateQueries({ queryKey: ["bi-dashboards"] });
        }}
      />
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דשבורדים מותאמים</h1>
          <p className="text-sm text-muted-foreground mt-1">עצב דשבורדים מותאמים עם ווידג׳טים גמישים</p>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-40" />
          <Button onClick={handleCreateNew} className="gap-2"><Plus className="w-4 h-4" /> דשבורד חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "פעיל", color: "text-emerald-400", bg: "bg-emerald-500/10", count: dashboards.filter(d => d.status === "active").length },
          { label: "ציבורי", color: "text-blue-400", bg: "bg-blue-500/10", count: dashboards.filter(d => d.isPublic).length },
          { label: "ברירת מחדל", color: "text-amber-400", bg: "bg-amber-500/10", count: dashboards.filter(d => d.isDefault).length },
          { label: "סה״כ", color: "text-purple-400", bg: "bg-purple-500/10", count: dashboards.length },
        ].map(stat => (
          <Card key={stat.label} className={`p-4 text-center ${stat.bg} border-none`}>
            <div className={`text-3xl font-bold ${stat.color}`}>{stat.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-card border border-border/50 rounded-xl h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <LayoutDashboard className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">אין דשבורדים</h3>
          <p className="text-sm text-muted-foreground mb-4">צור דשבורד מותאם עם ווידג׳טים ותרשימים</p>
          <Button onClick={handleCreateNew} className="gap-2"><Plus className="w-4 h-4" /> צור דשבורד</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(dashboard => (
            <Card key={dashboard.id} className="flex flex-col hover:border-primary/30 transition-colors">
              <div className="p-5 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <LayoutDashboard className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{dashboard.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{dashboard.description || dashboard.slug}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleOpenDesigner(dashboard)} className="p-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק דשבורד זה?"); if (ok) deleteMutation.mutate(dashboard.id); }} className="p-2 text-muted-foreground hover:text-destructive rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>}
                </div>
              </div>
              <div className="px-5 pb-3 flex flex-wrap gap-2">
                {dashboard.isDefault && <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 font-semibold">ברירת מחדל</span>}
                {dashboard.isPublic && <span className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 font-semibold">ציבורי</span>}
                {(dashboard.roleAssignments as any[])?.length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] rounded bg-purple-500/10 text-purple-400 font-semibold">{(dashboard.roleAssignments as any[]).length} תפקידים</span>
                )}
              </div>
              <div className="p-4 border-t border-border/30">
                <button onClick={() => handleOpenDesigner(dashboard)} className="w-full flex items-center justify-center gap-2 py-2 bg-primary/5 hover:bg-primary/10 text-primary rounded-lg text-sm font-medium transition-colors">
                  <Settings className="w-4 h-4" /> עריכת דשבורד
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardDesigner({ dashboard, onBack }: { dashboard: Dashboard | null; onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(dashboard?.name || "");
  const [description, setDescription] = useState(dashboard?.description || "");
  const [isDefault, setIsDefault] = useState(dashboard?.isDefault || false);
  const [isPublic, setIsPublic] = useState(dashboard?.isPublic || false);
  const [roleAssignments, setRoleAssignments] = useState<string[]>(
    (dashboard?.roleAssignments as any[])?.filter(r => typeof r === "string") || []
  );
  const [widgets, setWidgets] = useState<Widget[]>(dashboard?.widgets || []);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [addingWidget, setAddingWidget] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDashboardId, setSavedDashboardId] = useState<number | null>(dashboard?.id || null);

  const { data: reports = [] } = useQuery({
    queryKey: ["reports-for-widgets"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/platform/reports`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const saveDashboard = async () => {
    if (!name) { toast({ title: "שגיאה", description: "שם חובה" }); return; }
    setSaving(true);
    try {
      const payload = { name, description, isDefault, isPublic, roleAssignments, slug: name.toLowerCase().replace(/[^\w]+/g, "-") };
      let dashId = savedDashboardId;
      if (dashId) {
        await authFetch(`${API_BASE}/bi/dashboards/${dashId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        const r = await authFetch(`${API_BASE}/bi/dashboards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await r.json();
        dashId = data.id;
        setSavedDashboardId(dashId);
      }

      for (const w of widgets) {
        if (w.id < 0) {
          await authFetch(`${API_BASE}/bi/widgets`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...w, dashboardId: dashId, id: undefined }),
          });
        } else {
          await authFetch(`${API_BASE}/bi/widgets/${w.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(w),
          });
        }
      }

      toast({ title: "נשמר", description: "הדשבורד נשמר בהצלחה." });
      queryClient.invalidateQueries({ queryKey: ["bi-dashboards"] });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err?.message || "שמירה נכשלה" });
    } finally {
      setSaving(false);
    }
  };

  const removeWidget = async (widgetId: number) => {
    if (widgetId > 0) {
      try { await authFetch(`${API_BASE}/bi/widgets/${widgetId}`, { method: "DELETE" }); } catch {}
    }
    setWidgets(widgets.filter(w => w.id !== widgetId));
  };

  const toggleRole = (role: string) => {
    setRoleAssignments(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const handleAddWidget = (newWidget: Omit<Widget, "id">) => {
    const tempId = -Date.now();
    setWidgets([...widgets, { ...newWidget, id: tempId } as Widget]);
    setAddingWidget(false);
  };

  const handleUpdateWidget = (updatedWidget: Widget) => {
    setWidgets(widgets.map(w => w.id === updatedWidget.id ? updatedWidget : w));
    setEditingWidget(null);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{dashboard ? "עריכת דשבורד" : "דשבורד חדש"}</h1>
            <p className="text-sm text-muted-foreground">עצב את פריסת הדשבורד עם ווידג׳טים</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddingWidget(true)} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> הוסף ווידג׳ט</Button>
          <Button onClick={saveDashboard} disabled={saving} className="gap-2"><Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">הגדרות דשבורד</h3>
            <div>
              <Label>שם</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="דשבורד ניהולי" />
            </div>
            <div>
              <Label>תיאור</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור..." />
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded" />
                <span className="text-muted-foreground">ברירת מחדל</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="rounded" />
                <span className="text-muted-foreground">ציבורי לכולם</span>
              </label>
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">הרשאות תפקידים</h3>
            <p className="text-xs text-muted-foreground">בחר תפקידים שיראו דשבורד זה</p>
            {ROLES.map(role => (
              <label key={role} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/10 rounded px-2 py-1">
                <input type="checkbox" checked={roleAssignments.includes(role)} onChange={() => toggleRole(role)} className="rounded" />
                <span className="text-muted-foreground">{role}</span>
              </label>
            ))}
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">אזור ווידג׳טים</h3>
              {widgets.length === 0 && <span className="text-xs text-muted-foreground">לחץ "הוסף ווידג׳ט" כדי להתחיל</span>}
            </div>
            <div className="grid grid-cols-12 gap-3 min-h-[400px]">
              {widgets.map(widget => (
                <WidgetCard
                  key={widget.id}
                  widget={widget}
                  reports={reports}
                  onEdit={() => setEditingWidget(widget)}
                  onRemove={() => removeWidget(widget.id)}
                />
              ))}
              {widgets.length === 0 && (
                <div className="col-span-12 flex flex-col items-center justify-center py-16 text-muted-foreground border-2 border-dashed border-border/30 rounded-xl">
                  <LayoutDashboard className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">הדשבורד ריק</p>
                  <button onClick={() => setAddingWidget(true)} className="mt-3 text-xs text-primary hover:text-primary/80 font-medium">+ הוסף ווידג׳ט ראשון</button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {addingWidget && (
        <WidgetConfigurator
          dashboardId={savedDashboardId || 0}
          widget={null}
          reports={reports}
          onSave={handleAddWidget}
          onClose={() => setAddingWidget(false)}
        />
      )}

      {editingWidget && (
        <WidgetConfigurator
          dashboardId={savedDashboardId || 0}
          widget={editingWidget}
          reports={reports}
          onSave={(w) => handleUpdateWidget({ ...editingWidget, ...w })}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}

function WidgetCard({ widget, reports, onEdit, onRemove }: { widget: Widget; reports: any[]; onEdit: () => void; onRemove: () => void }) {
  const WidgetIcon = WIDGET_TYPES.find(t => t.value === widget.widgetType)?.icon || BarChart3;
  const colSpan = Math.min(12, Math.max(3, widget.sizeW || 4));

  return (
    <div className={`col-span-${colSpan} bg-card/50 border border-border/50 rounded-xl p-4 hover:border-primary/30 transition-colors`}
      style={{ gridColumn: `span ${colSpan}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <WidgetIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground">{widget.title}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"><Settings className="w-3.5 h-3.5" /></button>
          <button onClick={onRemove} className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <WidgetPreview widget={widget} reports={reports} />
    </div>
  );
}

function WidgetPreview({ widget, reports }: { widget: Widget; reports: any[] }) {
  const report = widget.reportId ? reports.find((r: any) => r.id === widget.reportId) : null;

  if (widget.widgetType === "kpi") {
    const { value = "—", label = "", prefix = "", suffix = "" } = widget.displayConfig || {};
    return (
      <div className="text-center py-2">
        <div className="text-2xl font-bold text-primary">{prefix}{value}{suffix}</div>
        <div className="text-xs text-muted-foreground mt-1">{label || widget.title}</div>
      </div>
    );
  }

  if (widget.widgetType === "metric") {
    const { trend = "stable", value = "—" } = widget.displayConfig || {};
    const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground";
    return (
      <div className="flex items-center gap-3 py-1">
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className={`text-xs font-medium ${trendColor}`}>{trend === "up" ? "▲" : trend === "down" ? "▼" : "—"}</div>
      </div>
    );
  }

  return (
    <div className="text-center py-3 text-muted-foreground">
      <p className="text-xs">{report ? `דוח: ${report.name}` : "לא מקושר לדוח"}</p>
      <p className="text-[10px] mt-1 opacity-50">סוג: {WIDGET_TYPES.find(t => t.value === widget.widgetType)?.label}</p>
    </div>
  );
}

function WidgetConfigurator({
  dashboardId,
  widget,
  reports,
  onSave,
  onClose,
}: {
  dashboardId: number;
  widget: Widget | null;
  reports: any[];
  onSave: (w: any) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(widget?.title || "");
  const [widgetType, setWidgetType] = useState(widget?.widgetType || "kpi");
  const [reportId, setReportId] = useState<number | null>(widget?.reportId || null);
  const [sizeW, setSizeW] = useState(widget?.sizeW || 4);
  const [sizeH, setSizeH] = useState(widget?.sizeH || 3);
  const [positionX, setPositionX] = useState(widget?.positionX || 0);
  const [positionY, setPositionY] = useState(widget?.positionY || 0);
  const [displayConfig, setDisplayConfig] = useState<any>(widget?.displayConfig || {});
  const [dataSourceConfig, setDataSourceConfig] = useState<any>(widget?.dataSourceConfig || {});

  const updateDisplay = (key: string, val: any) => setDisplayConfig({ ...displayConfig, [key]: val });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">{widget ? "עריכת ווידג׳ט" : "ווידג׳ט חדש"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label>כותרת</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת הווידג׳ט" />
          </div>

          <div>
            <Label>סוג ווידג׳ט</Label>
            <div className="grid grid-cols-4 gap-2">
              {WIDGET_TYPES.map(wt => (
                <button key={wt.value} onClick={() => setWidgetType(wt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors ${widgetType === wt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                  <wt.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{wt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>דוח מקושר (אופציונלי)</Label>
            <select value={reportId || ""} onChange={e => setReportId(e.target.value ? Number(e.target.value) : null)} className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">ללא דוח</option>
              {reports.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {widgetType === "kpi" && (
            <div className="space-y-2">
              <Label>הגדרות KPI</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input value={displayConfig.prefix || ""} onChange={e => updateDisplay("prefix", e.target.value)} placeholder="קידומת" />
                <Input value={displayConfig.value || ""} onChange={e => updateDisplay("value", e.target.value)} placeholder="ערך" />
                <Input value={displayConfig.suffix || ""} onChange={e => updateDisplay("suffix", e.target.value)} placeholder="סיומת" />
              </div>
              <Input value={displayConfig.label || ""} onChange={e => updateDisplay("label", e.target.value)} placeholder="תווית" />
            </div>
          )}

          {widgetType === "metric" && (
            <div className="space-y-2">
              <Label>הגדרות מדד</Label>
              <Input value={displayConfig.value || ""} onChange={e => updateDisplay("value", e.target.value)} placeholder="ערך" />
              <select value={displayConfig.trend || "stable"} onChange={e => updateDisplay("trend", e.target.value)} className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm">
                <option value="up">עלייה ▲</option>
                <option value="down">ירידה ▼</option>
                <option value="stable">יציב —</option>
              </select>
            </div>
          )}

          {widgetType === "chart" && (
            <div>
              <Label>סוג תרשים</Label>
              <select value={displayConfig.chartType || "bar"} onChange={e => updateDisplay("chartType", e.target.value)} className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm">
                {CHART_SUBTYPES.map(cs => <option key={cs.value} value={cs.value}>{cs.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>רוחב (1-12)</Label>
              <input type="range" min={2} max={12} value={sizeW} onChange={e => setSizeW(Number(e.target.value))} className="w-full" />
              <span className="text-xs text-muted-foreground">{sizeW} עמודות</span>
            </div>
            <div>
              <Label>גובה (1-6)</Label>
              <input type="range" min={1} max={6} value={sizeH} onChange={e => setSizeH(Number(e.target.value))} className="w-full" />
              <span className="text-xs text-muted-foreground">{sizeH} שורות</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
          <Button onClick={() => onSave({ dashboardId, widgetType, title, reportId, displayConfig, dataSourceConfig, positionX, positionY, sizeW, sizeH })} disabled={!title}>
            {widget ? "עדכן" : "הוסף"}
          </Button>
        </div>
      </div>
    </div>
  );
}
