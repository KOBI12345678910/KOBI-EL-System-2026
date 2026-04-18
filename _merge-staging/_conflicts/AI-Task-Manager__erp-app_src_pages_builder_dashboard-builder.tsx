import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Settings, BarChart3, PieChart, TrendingUp, Hash,
  Activity, Table2, ArrowUp, ArrowDown, GripVertical, X, Save,
  ChevronLeft, Eye, LayoutGrid, Maximize2, Minimize2, Filter, Columns
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { Link } from "wouter";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";
const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 80;

interface DashboardPage {
  id: number;
  moduleId: number | null;
  name: string;
  slug: string;
  isDefault: boolean;
  layout: any;
  settings: any;
  createdAt: string;
  updatedAt: string;
}

interface DashboardWidget {
  id: number;
  dashboardId: number;
  widgetType: string;
  title: string;
  entityId: number | null;
  config: any;
  position: any;
  size: any;
  settings: any;
  createdAt: string;
}

interface PlatformModule {
  id: number;
  name: string;
  slug: string;
}

interface ModuleEntity {
  id: number;
  name: string;
  slug: string;
  moduleId?: number;
}

interface EntityField {
  id: number;
  name: string;
  slug: string;
  fieldType: string;
  entityId: number;
}

const WIDGET_TYPES = [
  { type: "kpi_card", label: "כרטיס KPI", icon: ArrowUp, color: "orange", defaultW: 3, defaultH: 2 },
  { type: "counter", label: "מונה", icon: Hash, color: "pink", defaultW: 3, defaultH: 2 },
  { type: "chart_bar", label: "תרשים עמודות", icon: BarChart3, color: "blue", defaultW: 6, defaultH: 4 },
  { type: "chart_line", label: "תרשים קווי", icon: TrendingUp, color: "green", defaultW: 6, defaultH: 4 },
  { type: "chart_pie", label: "תרשים עוגה", icon: PieChart, color: "purple", defaultW: 4, defaultH: 4 },
  { type: "data_table", label: "טבלת נתונים", icon: Table2, color: "cyan", defaultW: 6, defaultH: 4 },
  { type: "recent_activity", label: "פעילות אחרונה", icon: Activity, color: "yellow", defaultW: 4, defaultH: 4 },
];

const WIDGET_COLORS: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  green: "bg-green-500/10 text-green-400 border-green-500/20",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  pink: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const SIZE_PRESETS = [
  { label: "קטן", w: 3, h: 2, icon: Minimize2 },
  { label: "בינוני", w: 4, h: 3, icon: Columns },
  { label: "גדול", w: 6, h: 4, icon: Maximize2 },
  { label: "רחב", w: 12, h: 3, icon: Maximize2 },
];

function getGridPos(widget: DashboardWidget) {
  const s = widget.settings || {};
  return {
    x: s.gridX ?? 0,
    y: s.gridY ?? 0,
    w: s.gridW ?? 4,
    h: s.gridH ?? 3,
  };
}

function autoLayoutWidgets(widgets: DashboardWidget[]): DashboardWidget[] {
  const grid: boolean[][] = [];
  const result: DashboardWidget[] = [];

  function canPlace(x: number, y: number, w: number, h: number) {
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        if (col >= GRID_COLS) return false;
        if (grid[row]?.[col]) return false;
      }
    }
    return true;
  }

  function place(x: number, y: number, w: number, h: number) {
    for (let row = y; row < y + h; row++) {
      if (!grid[row]) grid[row] = new Array(GRID_COLS).fill(false);
      for (let col = x; col < x + w; col++) {
        grid[row][col] = true;
      }
    }
  }

  for (const widget of widgets) {
    const pos = getGridPos(widget);
    let w = pos.w;
    let h = pos.h;
    const s = widget.settings || {};
    const hasExplicit = s.gridX !== undefined && s.gridY !== undefined;

    if (hasExplicit) {
      if (canPlace(pos.x, pos.y, w, h)) {
        place(pos.x, pos.y, w, h);
        result.push(widget);
        continue;
      }
    }

    let placed = false;
    for (let row = 0; row < 100 && !placed; row++) {
      for (let col = 0; col <= GRID_COLS - w && !placed; col++) {
        if (canPlace(col, row, w, h)) {
          place(col, row, w, h);
          result.push({
            ...widget,
            settings: { ...(widget.settings || {}), gridX: col, gridY: row, gridW: w, gridH: h },
          });
          placed = true;
        }
      }
    }
    if (!placed) result.push(widget);
  }
  return result;
}

export default function DashboardBuilder() {
  const queryClient = useQueryClient();
  const [selectedDashboard, setSelectedDashboard] = useState<DashboardPage | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showCreateDashboard, setShowCreateDashboard] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const { data: dashboards = [], isLoading } = useQuery<DashboardPage[]>({
    queryKey: ["dashboard-pages"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/dashboard-pages`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: widgets = [] } = useQuery<DashboardWidget[]>({
    queryKey: ["dashboard-widgets", selectedDashboard?.id],
    queryFn: async () => {
      if (!selectedDashboard) return [];
      const r = await authFetch(`${API}/platform/dashboard-pages/${selectedDashboard.id}/widgets`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedDashboard,
  });

  const { modules } = usePlatformModules();

  const { data: entities = [] } = useQuery<ModuleEntity[]>({
    queryKey: ["all-entities"],
    queryFn: async () => {
      const results = await Promise.allSettled(
        modules.map(async (mod) => {
          const r = await authFetch(`${API}/platform/modules/${mod.id}/entities`);
          if (!r.ok) return [];
          const ents = await r.json();
          return Array.isArray(ents) ? ents.map((e: any) => ({ ...e, moduleId: mod.id })) : [];
        })
      );
      return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    },
    enabled: modules.length > 0,
  });

  const createDashboardMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/dashboard-pages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create dashboard");
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-pages"] });
      setSelectedDashboard(data);
      setShowCreateDashboard(false);
    },
  });

  const deleteDashboardMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/dashboard-pages/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-pages"] });
      setSelectedDashboard(null);
    },
  });

  const addWidgetMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/dashboard-pages/${selectedDashboard!.id}/widgets`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to add widget");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-widgets", selectedDashboard?.id] });
      setShowAddWidget(false);
    },
  });

  const updateWidgetMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/dashboard-widgets/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update widget");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-widgets", selectedDashboard?.id] });
      setEditingWidget(null);
    },
  });

  const deleteWidgetMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/dashboard-widgets/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-widgets", selectedDashboard?.id] });
    },
  });

  const layoutWidgets = useMemo(() => autoLayoutWidgets(widgets), [widgets]);

  const maxRow = layoutWidgets.reduce((max, w) => {
    const pos = getGridPos(w);
    return Math.max(max, pos.y + pos.h);
  }, 4);

  if (!selectedDashboard) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">בונה דשבורדים</h1>
            <p className="text-muted-foreground mt-1">צור דשבורדים מותאמים אישית עם ווידג׳טים — גרפים, KPI, טבלאות ועוד</p>
          </div>
          <button onClick={() => setShowCreateDashboard(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-5 h-5" />
            דשבורד חדש
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : dashboards.length === 0 ? (
          <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8 text-primary/50" />
            </div>
            <h3 className="text-xl font-semibold mb-2">אין עדיין דשבורדים</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">צור דשבורד ראשון והוסף ווידג׳טים לנתח ולהציג את הנתונים שלך.</p>
            <button onClick={() => setShowCreateDashboard(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-5 h-5" />
              צור דשבורד ראשון
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((dash, i) => (
              <motion.div key={dash.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all cursor-pointer group"
                onClick={() => setSelectedDashboard(dash)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{dash.name}</h3>
                      <p className="text-xs text-muted-foreground">{dash.slug}</p>
                    </div>
                  </div>
                  {dash.isDefault && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">ברירת מחדל</span>}
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                  <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                    <Settings className="w-4 h-4" />
                    עריכה
                  </button>
                  {isSuperAdmin && <button onClick={async (e) => { e.stopPropagation(); const ok = await globalConfirm("למחוק את הדשבורד?", { itemName: dash.name, entityType: "דשבורד" }); if (ok) deleteDashboardMutation.mutate(dash.id); }}
                    className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {showCreateDashboard && (
            <CreateDashboardModal
              modules={modules}
              onClose={() => setShowCreateDashboard(false)}
              onSubmit={(data) => createDashboardMutation.mutate(data)}
              isLoading={createDashboardMutation.isPending}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedDashboard(null)} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">{selectedDashboard.name}</h1>
            <p className="text-sm text-muted-foreground">עריכת דשבורד — בחר גודל ומיקום לווידג׳טים בתצוגת Grid</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreviewMode(!previewMode)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${previewMode ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            <Eye className="w-4 h-4" />
            {previewMode ? "מצב תצוגה" : "תצוגה מקדימה"}
          </button>
          <button onClick={() => setShowAddWidget(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            הוסף ווידג׳ט
          </button>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-2xl p-12 text-center">
          <LayoutGrid className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">הדשבורד ריק</h3>
          <p className="text-muted-foreground mb-4">הוסף ווידג׳טים כדי להציג נתונים, גרפים ו-KPI</p>
          <button onClick={() => setShowAddWidget(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />
            הוסף ווידג׳ט ראשון
          </button>
        </div>
      ) : (
        <>
          {!previewMode && (
            <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/30 rounded-xl border border-border/30 text-xs text-muted-foreground">
              <LayoutGrid className="w-4 h-4" />
              <span>Grid: {GRID_COLS} עמודות</span>
              <span>|</span>
              <span>לחץ על הגדרות של ווידג׳ט כדי לשנות גודל ומיקום</span>
            </div>
          )}
          <div
            className="relative"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
              gridAutoRows: `${GRID_ROW_HEIGHT}px`,
              gap: "12px",
              minHeight: `${maxRow * GRID_ROW_HEIGHT + (maxRow - 1) * 12}px`,
            }}
          >
            {!previewMode && Array.from({ length: maxRow }).map((_, row) =>
              Array.from({ length: GRID_COLS }).map((_, col) => (
                <div
                  key={`bg-${row}-${col}`}
                  className="border border-dashed border-border/20 rounded-lg"
                  style={{
                    gridColumn: `${col + 1} / ${col + 2}`,
                    gridRow: `${row + 1} / ${row + 2}`,
                    pointerEvents: "none",
                  }}
                />
              ))
            )}

            {layoutWidgets.map((widget, i) => {
              const pos = getGridPos(widget);
              const widgetDef = WIDGET_TYPES.find(w => w.type === widget.widgetType) || WIDGET_TYPES[0];
              const Icon = widgetDef.icon;
              const colorClasses = WIDGET_COLORS[widgetDef.color] || WIDGET_COLORS.blue;
              return (
                <motion.div
                  key={widget.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`bg-card border border-border rounded-2xl overflow-hidden z-10 ${previewMode ? "" : "hover:border-primary/30"}`}
                  style={{
                    gridColumn: `${pos.x + 1} / span ${pos.w}`,
                    gridRow: `${pos.y + 1} / span ${pos.h}`,
                  }}
                >
                  {!previewMode && (
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab" />
                        <span className="text-[10px] text-muted-foreground">{widgetDef.label}</span>
                        <span className="text-[10px] text-muted-foreground/50">{pos.w}x{pos.h}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => setEditingWidget(widget)} className="p-1 hover:bg-muted rounded transition-colors" title="הגדרות">
                          <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteWidgetMutation.mutate(widget.id)} className="p-1 hover:bg-destructive/10 rounded transition-colors" title="מחק">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="p-4 h-full overflow-hidden">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colorClasses}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm truncate">{widget.title}</h4>
                        {widget.entityId && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {entities.find(e => e.id === widget.entityId)?.name || `Entity #${widget.entityId}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <WidgetPreview type={widget.widgetType} config={widget.config} entityId={widget.entityId} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      <AnimatePresence>
        {showAddWidget && (
          <AddWidgetModal
            entities={entities}
            onClose={() => setShowAddWidget(false)}
            onSubmit={(data) => addWidgetMutation.mutate(data)}
            isLoading={addWidgetMutation.isPending}
          />
        )}
        {editingWidget && (
          <EditWidgetModal
            widget={editingWidget}
            entities={entities}
            onClose={() => setEditingWidget(null)}
            onSubmit={(data) => updateWidgetMutation.mutate({ id: editingWidget.id, ...data })}
            isLoading={updateWidgetMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function WidgetPreview({ type, config, entityId }: { type: string; config: any; entityId: number | null }) {
  const { data: widgetData, isLoading } = useQuery({
    queryKey: ["widget-data", type, entityId, JSON.stringify(config)],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/dashboard-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetType: type, entityId, config }),
      });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 30000,
  });

  if (isLoading) {
    return <div className="h-16 flex items-center justify-center"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (type === "kpi_card") {
    const value = widgetData?.value ?? config?.value ?? "—";
    return (
      <div className="text-center py-2">
        <p className="text-xl sm:text-3xl font-bold text-primary">{typeof value === "number" ? value.toLocaleString() : value}</p>
        <p className="text-xs text-muted-foreground mt-1">{widgetData?.label || config?.label || "KPI"}</p>
        {config?.change && (
          <div className={`flex items-center justify-center gap-1 mt-2 text-xs ${Number(config.change) >= 0 ? "text-green-400" : "text-red-400"}`}>
            {Number(config.change) >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {Math.abs(Number(config.change))}%
          </div>
        )}
      </div>
    );
  }
  if (type === "counter") {
    const count = widgetData?.value ?? config?.count ?? 0;
    return (
      <div className="text-center py-2">
        <p className="text-4xl font-bold">{typeof count === "number" ? count.toLocaleString() : count}</p>
        <p className="text-sm text-muted-foreground mt-1">{widgetData?.label || config?.label || "רשומות"}</p>
      </div>
    );
  }
  if (type === "chart_bar") {
    const labels = widgetData?.labels || [];
    const data = widgetData?.datasets?.[0]?.data || [];
    const maxVal = Math.max(...data, 1);
    if (labels.length === 0) {
      return (
        <div className="flex items-end gap-1 h-20 mt-2">
          {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
            <div key={i} className="flex-1 bg-blue-500/20 rounded-t" style={{ height: `${h}%` }} />
          ))}
        </div>
      );
    }
    return (
      <div className="mt-2">
        <div className="flex items-end gap-1 h-24">
          {data.map((val: number, i: number) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground">{val}</span>
              <div className="w-full bg-blue-500/30 rounded-t transition-all" style={{ height: `${(val / maxVal) * 100}%`, minHeight: "2px" }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {labels.map((l: string, i: number) => (
            <div key={i} className="flex-1 text-center text-[8px] text-muted-foreground truncate">{l}</div>
          ))}
        </div>
      </div>
    );
  }
  if (type === "chart_line") {
    const data = widgetData?.datasets?.[0]?.data || [];
    if (data.length === 0) {
      return (
        <div className="h-20 mt-2 flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>
      );
    }
    const maxVal = Math.max(...data, 1);
    const points = data.map((v: number, i: number) => `${(i / Math.max(data.length - 1, 1)) * 100},${40 - (v / maxVal) * 35}`).join(" ");
    return (
      <div className="h-20 mt-2 flex items-center justify-center">
        <svg viewBox="0 0 100 40" className="w-full h-full">
          <polyline points={points} fill="none" stroke="rgb(34,197,94)" strokeWidth="2" />
        </svg>
      </div>
    );
  }
  if (type === "chart_pie") {
    const labels = widgetData?.labels || [];
    const data = widgetData?.datasets?.[0]?.data || [];
    const total = data.reduce((a: number, b: number) => a + b, 0) || 1;
    const colors = ["rgb(168,85,247)", "rgb(59,130,246)", "rgb(234,179,8)", "rgb(16,185,129)", "rgb(239,68,68)", "rgb(236,72,153)"];
    if (labels.length === 0) {
      return (
        <div className="flex items-center justify-center h-20 mt-2">
          <svg viewBox="0 0 40 40" className="w-16 h-16">
            <circle cx="20" cy="20" r="15" fill="none" stroke="rgb(168,85,247)" strokeWidth="8" strokeDasharray="30 70" strokeDashoffset="25" />
            <circle cx="20" cy="20" r="15" fill="none" stroke="rgb(59,130,246)" strokeWidth="8" strokeDasharray="25 75" strokeDashoffset="55" />
          </svg>
        </div>
      );
    }
    let offset = 0;
    const circumference = 2 * Math.PI * 15;
    return (
      <div className="flex items-center gap-3 mt-2">
        <svg viewBox="0 0 40 40" className="w-16 h-16 flex-shrink-0">
          {data.map((val: number, i: number) => {
            const pct = (val / total) * circumference;
            const el = <circle key={i} cx="20" cy="20" r="15" fill="none" stroke={colors[i % colors.length]} strokeWidth="8" strokeDasharray={`${pct} ${circumference - pct}`} strokeDashoffset={-offset} transform="rotate(-90 20 20)" />;
            offset += pct;
            return el;
          })}
        </svg>
        <div className="space-y-0.5 text-[9px] overflow-hidden">
          {labels.slice(0, 4).map((l: string, i: number) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="truncate text-muted-foreground">{l} ({data[i]})</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (type === "data_table") {
    const records = widgetData?.records || [];
    const tblFields = widgetData?.fields || [];
    if (records.length === 0) {
      return <div className="mt-2 text-center text-xs text-muted-foreground py-4">אין נתונים</div>;
    }
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-border/50">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-muted/30">
              {tblFields.slice(0, 4).map((f: any) => (
                <th key={f.slug} className="px-2 py-1 text-right font-medium text-muted-foreground">{f.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.slice(0, 5).map((rec: any) => (
              <tr key={rec.id} className="border-t border-border/30">
                {tblFields.slice(0, 4).map((f: any) => (
                  <td key={f.slug} className="px-2 py-1 truncate max-w-[80px]">{String((rec.data || {})[f.slug] ?? "-")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (type === "recent_activity") {
    const logs = widgetData?.logs || [];
    if (logs.length === 0) {
      return <div className="mt-2 text-center text-xs text-muted-foreground py-4">אין פעילות אחרונה</div>;
    }
    const actionLabels: Record<string, string> = {
      create: "נוצר",
      update: "עודכן",
      delete: "נמחק",
      status_change: "שינוי סטטוס",
      publish: "פורסם",
      unpublish: "הוחזר לטיוטה",
    };
    return (
      <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
        {logs.slice(0, 8).map((log: any) => (
          <div key={log.id} className="flex items-center gap-2 text-[10px]">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.action === "create" ? "bg-green-400" : log.action === "delete" ? "bg-red-400" : "bg-blue-400"}`} />
            <span className="text-muted-foreground">{actionLabels[log.action] || log.action}</span>
            <span className="text-muted-foreground/60 mr-auto">{new Date(log.createdAt).toLocaleDateString("he-IL")}</span>
          </div>
        ))}
      </div>
    );
  }
  return <div className="h-16 flex items-center justify-center text-muted-foreground text-sm">תצוגה מקדימה</div>;
}

function CreateDashboardModal({ modules, onClose, onSubmit, isLoading }: {
  modules: PlatformModule[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({ name: "", slug: "", moduleId: "", isDefault: false });
  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">דשבורד חדש</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הדשבורד</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
              placeholder="למשל: דשבורד מכירות" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Slug</label>
            <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} dir="ltr"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">מודול (אופציונלי)</label>
            <select value={form.moduleId} onChange={e => setForm(f => ({ ...f, moduleId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">כללי (דף הבית)</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="w-4 h-4 rounded" />
            <span className="text-sm">דשבורד ברירת מחדל (יוצג בדף הבית)</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit({ ...form, moduleId: form.moduleId ? Number(form.moduleId) : undefined })} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50">
            {isLoading ? "יוצר..." : "צור דשבורד"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddWidgetModal({ entities, onClose, onSubmit, isLoading }: {
  entities: ModuleEntity[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", entityId: "", config: {} as any, gridW: 4, gridH: 3 });

  const { data: entityFields = [] } = useQuery<EntityField[]>({
    queryKey: ["entity-fields-for-widget", form.entityId],
    queryFn: async () => {
      if (!form.entityId) return [];
      const r = await authFetch(`${API}/platform/entities/${form.entityId}/fields`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!form.entityId,
  });

  const { data: entityStatuses = [] } = useQuery<any[]>({
    queryKey: ["entity-statuses-for-widget", form.entityId],
    queryFn: async () => {
      if (!form.entityId) return [];
      const r = await authFetch(`${API}/platform/entities/${form.entityId}/statuses`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!form.entityId,
  });

  const numericFields = entityFields.filter(f => ["number", "currency", "decimal", "real", "integer", "float"].includes(f.fieldType));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">הוסף ווידג׳ט</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!selectedType ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {WIDGET_TYPES.map(wt => {
              const Icon = wt.icon;
              const colorClasses = WIDGET_COLORS[wt.color];
              return (
                <button key={wt.type} onClick={() => {
                  setSelectedType(wt.type);
                  setForm(f => ({ ...f, title: wt.label, gridW: wt.defaultW, gridH: wt.defaultH }));
                }}
                  className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 transition-all">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${colorClasses}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-medium">{wt.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setSelectedType(null)} className="text-sm text-primary hover:underline flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" />
              חזרה לבחירת סוג
            </button>
            <div>
              <label className="block text-sm font-medium mb-1.5">כותרת</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">ישות מקור נתונים</label>
              <select value={form.entityId} onChange={e => setForm(f => ({ ...f, entityId: e.target.value, config: {} }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">ללא (כללי)</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            {(selectedType === "kpi_card" || selectedType === "counter") && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">סוג חישוב</label>
                  <select value={form.config.aggregation || "count"} onChange={e => setForm(f => ({ ...f, config: { ...f.config, aggregation: e.target.value } }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="count">ספירה</option>
                    <option value="sum">סכום</option>
                    <option value="avg">ממוצע</option>
                    <option value="min">מינימום</option>
                    <option value="max">מקסימום</option>
                  </select>
                </div>
                {form.config.aggregation && form.config.aggregation !== "count" && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">שדה לחישוב</label>
                    <select value={form.config.fieldSlug || ""} onChange={e => setForm(f => ({ ...f, config: { ...f.config, fieldSlug: e.target.value } }))}
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">בחר שדה</option>
                      {numericFields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                      {numericFields.length === 0 && entityFields.length > 0 && (
                        entityFields.map(f => <option key={f.slug} value={f.slug}>{f.name} ({f.fieldType})</option>)
                      )}
                    </select>
                  </div>
                )}
                {entityStatuses.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">סינון לפי סטטוס</label>
                    <select value={form.config.statusFilter || ""} onChange={e => setForm(f => ({ ...f, config: { ...f.config, statusFilter: e.target.value || undefined } }))}
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">הכל</option>
                      {entityStatuses.map((s: any) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1.5">תווית</label>
                  <input value={form.config.label || ""} onChange={e => setForm(f => ({ ...f, config: { ...f.config, label: e.target.value } }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </>
            )}

            {(selectedType === "chart_bar" || selectedType === "chart_line" || selectedType === "chart_pie") && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">קבץ לפי</label>
                  <select value={form.config.groupByField || "_status"} onChange={e => setForm(f => ({ ...f, config: { ...f.config, groupByField: e.target.value } }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="_status">סטטוס</option>
                    {entityFields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">סוג חישוב</label>
                  <select value={form.config.aggregation || "count"} onChange={e => setForm(f => ({ ...f, config: { ...f.config, aggregation: e.target.value } }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="count">ספירה</option>
                    <option value="sum">סכום</option>
                    <option value="avg">ממוצע</option>
                  </select>
                </div>
                {form.config.aggregation && form.config.aggregation !== "count" && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">שדה ערך</label>
                    <select value={form.config.valueField || ""} onChange={e => setForm(f => ({ ...f, config: { ...f.config, valueField: e.target.value } }))}
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">בחר שדה</option>
                      {numericFields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}

            {selectedType === "data_table" && (
              <div>
                <label className="block text-sm font-medium mb-1.5">מספר שורות להצגה</label>
                <input type="number" value={form.config.limit || 10} min={1} max={50}
                  onChange={e => setForm(f => ({ ...f, config: { ...f.config, limit: Number(e.target.value) } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            )}

            {selectedType === "recent_activity" && (
              <div>
                <label className="block text-sm font-medium mb-1.5">מספר רשומות להצגה</label>
                <input type="number" value={form.config.limit || 10} min={1} max={50}
                  onChange={e => setForm(f => ({ ...f, config: { ...f.config, limit: Number(e.target.value) } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">גודל בגריד</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SIZE_PRESETS.map(preset => {
                  const isActive = form.gridW === preset.w && form.gridH === preset.h;
                  return (
                    <button key={preset.label} onClick={() => setForm(f => ({ ...f, gridW: preset.w, gridH: preset.h }))}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs transition-all ${isActive ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                      <preset.icon className="w-4 h-4" />
                      <span className="font-medium">{preset.label}</span>
                      <span className="text-[10px] text-muted-foreground">{preset.w}x{preset.h}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground">רוחב (עמודות)</label>
                  <input type="number" value={form.gridW} min={1} max={12}
                    onChange={e => setForm(f => ({ ...f, gridW: Math.min(12, Math.max(1, Number(e.target.value))) }))}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground">גובה (שורות)</label>
                  <input type="number" value={form.gridH} min={1} max={8}
                    onChange={e => setForm(f => ({ ...f, gridH: Math.min(8, Math.max(1, Number(e.target.value))) }))}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
            </div>

            {form.entityId && selectedType && (
              <div className="border border-border/50 rounded-xl p-4 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  תצוגה מקדימה עם נתונים אמיתיים
                </p>
                <WidgetPreview type={selectedType} config={form.config} entityId={Number(form.entityId)} />
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button onClick={() => onSubmit({
                widgetType: selectedType,
                title: form.title,
                entityId: form.entityId ? Number(form.entityId) : undefined,
                config: form.config,
                position: 0,
                size: "medium",
                settings: { gridW: form.gridW, gridH: form.gridH, gridX: 0, gridY: 0 },
              })} disabled={!form.title || isLoading}
                className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
                {isLoading ? "מוסיף..." : "הוסף ווידג׳ט"}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">ביטול</button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function EditWidgetModal({ widget, entities, onClose, onSubmit, isLoading }: {
  widget: DashboardWidget;
  entities: ModuleEntity[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const pos = getGridPos(widget);
  const [form, setForm] = useState({
    title: widget.title,
    entityId: widget.entityId?.toString() || "",
    config: widget.config || {},
    gridX: pos.x,
    gridY: pos.y,
    gridW: pos.w,
    gridH: pos.h,
  });

  const { data: entityFields = [] } = useQuery<EntityField[]>({
    queryKey: ["entity-fields-for-widget-edit", form.entityId],
    queryFn: async () => {
      if (!form.entityId) return [];
      const r = await authFetch(`${API}/platform/entities/${form.entityId}/fields`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!form.entityId,
  });

  const { data: entityStatuses = [] } = useQuery<any[]>({
    queryKey: ["entity-statuses-for-widget-edit", form.entityId],
    queryFn: async () => {
      if (!form.entityId) return [];
      const r = await authFetch(`${API}/platform/entities/${form.entityId}/statuses`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!form.entityId,
  });

  const numericFields = entityFields.filter(f => ["number", "currency", "decimal", "real", "integer", "float"].includes(f.fieldType));
  const widgetDef = WIDGET_TYPES.find(w => w.type === widget.widgetType);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">עריכת ווידג׳ט</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">כותרת</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">ישות מקור נתונים</label>
            <select value={form.entityId} onChange={e => setForm(f => ({ ...f, entityId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">ללא</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          {(widget.widgetType === "kpi_card" || widget.widgetType === "counter") && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5">סוג חישוב</label>
                <select value={form.config.aggregation || "count"} onChange={e => setForm(f => ({ ...f, config: { ...f.config, aggregation: e.target.value } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="count">ספירה</option>
                  <option value="sum">סכום</option>
                  <option value="avg">ממוצע</option>
                  <option value="min">מינימום</option>
                  <option value="max">מקסימום</option>
                </select>
              </div>
              {form.config.aggregation && form.config.aggregation !== "count" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">שדה לחישוב</label>
                  <select value={form.config.fieldSlug || ""} onChange={e => setForm(f => ({ ...f, config: { ...f.config, fieldSlug: e.target.value } }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">בחר שדה</option>
                    {numericFields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                    {numericFields.length === 0 && entityFields.length > 0 && (
                      entityFields.map(f => <option key={f.slug} value={f.slug}>{f.name} ({f.fieldType})</option>)
                    )}
                  </select>
                </div>
              )}
              {entityStatuses.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">סינון לפי סטטוס</label>
                  <select value={form.config.statusFilter || ""} onChange={e => setForm(f => ({ ...f, config: { ...f.config, statusFilter: e.target.value || undefined } }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">הכל</option>
                    {entityStatuses.map((s: any) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">תווית</label>
                <input value={form.config.label || ""} onChange={e => setForm(f => ({ ...f, config: { ...f.config, label: e.target.value } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </>
          )}

          {(widget.widgetType === "chart_bar" || widget.widgetType === "chart_line" || widget.widgetType === "chart_pie") && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5">קבץ לפי</label>
                <select value={form.config.groupByField || "_status"} onChange={e => setForm(f => ({ ...f, config: { ...f.config, groupByField: e.target.value } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="_status">סטטוס</option>
                  {entityFields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">סוג חישוב</label>
                <select value={form.config.aggregation || "count"} onChange={e => setForm(f => ({ ...f, config: { ...f.config, aggregation: e.target.value } }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="count">ספירה</option>
                  <option value="sum">סכום</option>
                  <option value="avg">ממוצע</option>
                </select>
              </div>
              {form.config.aggregation && form.config.aggregation !== "count" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">שדה ערך</label>
                  <select value={form.config.valueField || ""} onChange={e => setForm(f => ({ ...f, config: { ...f.config, valueField: e.target.value } }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">בחר שדה</option>
                    {numericFields.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {widget.widgetType === "data_table" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">מספר שורות להצגה</label>
              <input type="number" value={form.config.limit || 10} min={1} max={50}
                onChange={e => setForm(f => ({ ...f, config: { ...f.config, limit: Number(e.target.value) } }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          )}

          {widget.widgetType === "recent_activity" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">מספר רשומות להצגה</label>
              <input type="number" value={form.config.limit || 10} min={1} max={50}
                onChange={e => setForm(f => ({ ...f, config: { ...f.config, limit: Number(e.target.value) } }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">מיקום וגודל בגריד</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {SIZE_PRESETS.map(preset => {
                const isActive = form.gridW === preset.w && form.gridH === preset.h;
                return (
                  <button key={preset.label} onClick={() => setForm(f => ({ ...f, gridW: preset.w, gridH: preset.h }))}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all ${isActive ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                    <preset.icon className="w-3.5 h-3.5" />
                    <span className="font-medium">{preset.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">X (עמודה)</label>
                <input type="number" value={form.gridX} min={0} max={11}
                  onChange={e => setForm(f => ({ ...f, gridX: Math.min(11, Math.max(0, Number(e.target.value))) }))}
                  className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Y (שורה)</label>
                <input type="number" value={form.gridY} min={0}
                  onChange={e => setForm(f => ({ ...f, gridY: Math.max(0, Number(e.target.value)) }))}
                  className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">רוחב</label>
                <input type="number" value={form.gridW} min={1} max={12}
                  onChange={e => setForm(f => ({ ...f, gridW: Math.min(12, Math.max(1, Number(e.target.value))) }))}
                  className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">גובה</label>
                <input type="number" value={form.gridH} min={1} max={8}
                  onChange={e => setForm(f => ({ ...f, gridH: Math.min(8, Math.max(1, Number(e.target.value))) }))}
                  className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
          </div>

          {form.entityId && widget.widgetType && (
            <div className="border border-border/50 rounded-xl p-4 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                תצוגה מקדימה
              </p>
              <WidgetPreview type={widget.widgetType} config={form.config} entityId={Number(form.entityId)} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit({
            title: form.title,
            entityId: form.entityId ? Number(form.entityId) : null,
            config: form.config,
            settings: { gridX: form.gridX, gridY: form.gridY, gridW: form.gridW, gridH: form.gridH },
          })}
            disabled={!form.title || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "שומר..." : "עדכן ווידג׳ט"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="dashboards" />
        <RelatedRecords entityType="dashboards" />
      </div>
      </motion.div>
    </motion.div>
  );
}
