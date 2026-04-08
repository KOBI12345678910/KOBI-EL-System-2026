import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { SkeletonPage } from "@/components/ui/skeleton-card";
import { Package, Database, ArrowLeft, ArrowUp, ArrowDown, BarChart3, PieChart, TrendingUp, Activity, LayoutGrid, Settings, Plus, Factory, Wrench, ClipboardList, Users, Truck, ShoppingCart, Ruler, CheckCircle2, AlertTriangle, DollarSign, Boxes, Hammer, Bell, Building2, Receipt, Target, Megaphone, Bot, Star, Shield, Percent, Radio, Zap, Hash, Table2, BarChart2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import AIInsights from "@/components/ai/ai-insights";
import DashboardKPI from "@/components/dashboard-kpi";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import { ErrorState, ErrorBoundary } from "@/components/ui/unified-states";
import React, { Component, useState, useEffect, useMemo, type ReactNode } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 80;
const DASHBOARD_STALE_TIME = 5 * 60 * 1000;
const DASHBOARD_QUERY_TIMEOUT_MS = 10_000;
const WIDGET_CONCURRENCY = 3;

function useWidgetConcurrency(count: number, batchSize = WIDGET_CONCURRENCY): boolean[] {
  const [enabledCount, setEnabledCount] = useState(batchSize);

  useEffect(() => {
    if (enabledCount >= count) return;
    const timer = setTimeout(() => {
      setEnabledCount(prev => Math.min(prev + batchSize, count));
    }, 300);
    return () => clearTimeout(timer);
  }, [enabledCount, count, batchSize]);

  useEffect(() => {
    setEnabledCount(batchSize);
  }, [count, batchSize]);

  return Array.from({ length: count }, (_, i) => i < enabledCount);
}

function withQueryTimeout<T>(
  queryFn: () => Promise<T>,
  timeoutMs = DASHBOARD_QUERY_TIMEOUT_MS
): () => Promise<T> {
  return () =>
    Promise.race([
      queryFn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("הטעינה ארכה זמן רב מדי (timeout). נסה שוב.")), timeoutMs)
      ),
    ]);
}

class WidgetErrorBoundary extends Component<
  { children: ReactNode; title?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.warn("[WidgetErrorBoundary]", err.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground p-4">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span className="text-xs text-center">שגיאה בטעינת הווידג׳ט</span>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            נסה שוב
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface WidgetJsonb {
  [key: string]: unknown;
}

interface DashboardWidget {
  id: number;
  dashboardId: number;
  widgetType: string;
  title: string;
  entityId: number | null;
  config: WidgetJsonb;
  position: WidgetJsonb;
  size: WidgetJsonb;
  settings: WidgetJsonb;
  createdAt: string;
}

interface DashboardPage {
  id: number;
  isDefault: boolean;
  moduleId: number | null;
  name: string;
}

interface RawMaterialItem {
  id: number;
  materialName: string;
  category: string;
  currentStock: string | null;
  reorderPoint: string | null;
  unit: string;
}

function getGridPos(widget: DashboardWidget) {
  const s = widget.settings || {};
  return {
    x: typeof s.gridX === "number" ? s.gridX : 0,
    y: typeof s.gridY === "number" ? s.gridY : 0,
    w: typeof s.gridW === "number" ? s.gridW : 4,
    h: typeof s.gridH === "number" ? s.gridH : 3,
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

const QUICK_ACTIONS = [
  { label: "הוראת עבודה חדשה", icon: ClipboardList, href: "/production/work-orders", color: "from-amber-600 to-orange-600" },
  { label: "הצעת מחיר", icon: DollarSign, href: "/price-quotes", color: "from-emerald-600 to-green-600" },
  { label: "הזמנת רכש", icon: ShoppingCart, href: "/purchase-orders", color: "from-purple-600 to-violet-600" },
  { label: "הזמנת מכירה", icon: Receipt, href: "/sales/orders", color: "from-teal-600 to-cyan-600" },
  { label: "ניהול לקוחות", icon: Users, href: "/sales/customers", color: "from-pink-600 to-rose-600" },
  { label: "ניהול ספקים", icon: Truck, href: "/suppliers", color: "from-orange-600 to-amber-600" },
  { label: "מוצר חדש", icon: Package, href: "/product-catalog", color: "from-blue-600 to-indigo-600" },
  { label: "חומרי גלם", icon: Boxes, href: "/raw-materials", color: "from-cyan-600 to-blue-600" },
];

const WIDGET_COLORS: Record<string, string> = {
  kpi_card: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  counter: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  chart_bar: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  chart_line: "bg-green-500/10 text-green-400 border-green-500/20",
  chart_pie: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  data_table: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  recent_activity: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const WIDGET_ICONS: Record<string, (props: { className?: string; size?: number }) => ReturnType<typeof ArrowUp>> = {
  kpi_card: ArrowUp,
  counter: Hash,
  chart_bar: BarChart3,
  chart_line: TrendingUp,
  chart_pie: PieChart,
  data_table: Table2,
  recent_activity: Activity,
};

export default function Dashboard() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: dashboards = [], isLoading: dashboardsLoading, isError: dashboardsError } = useQuery<DashboardPage[]>({
    queryKey: ["dashboard-pages"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/platform/dashboard-pages`);
      if (!r.ok) throw new Error(`שגיאה ${r.status}`);
      return r.json();
    }),
    retry: 1,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
  });

  const defaultDashboard = dashboards.find(d => d.isDefault && !d.moduleId) || dashboards.find(d => d.isDefault) || null;

  const { data: dynamicWidgets = [], isError: widgetsError, refetch: refetchWidgets } = useQuery<DashboardWidget[]>({
    queryKey: ["dashboard-widgets-home", defaultDashboard?.id],
    queryFn: withQueryTimeout(async () => {
      if (!defaultDashboard) return [];
      const r = await authFetch(`${API}/platform/dashboard-pages/${defaultDashboard.id}/widgets`);
      if (!r.ok) throw new Error(`שגיאה ${r.status}`);
      return r.json();
    }),
    enabled: !!defaultDashboard,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  if (dashboardsLoading) return <SkeletonPage />;

  if (dashboardsError) {
    return (
      <ErrorState
        title="לא הצלחנו לטעון את הדשבורד"
        description="אירעה שגיאה בטעינת הנתונים. ייתכן שיש בעיית רשת או שהבקשה ארכה זמן רב מדי."
        onRetry={() => queryClient.invalidateQueries({ queryKey: ["dashboard-pages"] })}
      />
    );
  }

  if (defaultDashboard) {
    if (widgetsError) {
      return (
        <div className="space-y-4 sm:space-y-6">
          <AIInsights />
          <ErrorState
            title="לא הצלחנו לטעון את הווידג׳טים"
            description="אירעה שגיאה בטעינת רכיבי הדשבורד. ייתכן שיש בעיית רשת או שהבקשה ארכה זמן רב מדי."
            onRetry={() => refetchWidgets()}
          />
        </div>
      );
    }
    return (
      <div className="space-y-4 sm:space-y-6">
        <AIInsights />
        <DynamicDashboardView dashboard={defaultDashboard} widgets={dynamicWidgets} navigate={navigate} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <AIInsights />
      <DashboardKPI />
      <StaticDashboard navigate={navigate} />
    </div>
  );
}

function DynamicDashboardView({ dashboard, widgets, navigate }: { dashboard: DashboardPage; widgets: DashboardWidget[]; navigate: (path: string) => void }) {
  const filteredWidgets = useMemo(() => widgets.filter(w => w.widgetType !== "quick_actions"), [widgets]);
  const layoutWidgets = useMemo(() => autoLayoutWidgets(filteredWidgets), [filteredWidgets]);
  const widgetEnabled = useWidgetConcurrency(layoutWidgets.length);
  const maxRow = layoutWidgets.reduce((max, w) => {
    const pos = getGridPos(w);
    return Math.max(max, pos.y + pos.h);
  }, 4);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground tracking-tight">{dashboard.name}</h1>
          <p className="text-muted-foreground mt-1">דשבורד דינמי עם נתונים בזמן אמת</p>
        </div>
        <button
          onClick={() => navigate("/builder/dashboards")}
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-xl transition-colors"
        >
          <Settings className="w-4 h-4" />
          עריכת דשבורד
        </button>
      </div>

      {widgets.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-2xl p-12 text-center">
          <LayoutGrid className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">הדשבורד ריק</h3>
          <p className="text-muted-foreground mb-4">הוסף ווידג׳טים דרך בונה הדשבורדים כדי להציג נתונים</p>
          <button onClick={() => navigate("/builder/dashboards")} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" />
            הגדרת דשבורד
          </button>
        </div>
      ) : null}

      {filteredWidgets.length > 0 && <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridAutoRows: `${GRID_ROW_HEIGHT}px`,
          gap: "12px",
          minHeight: `${maxRow * GRID_ROW_HEIGHT + (maxRow - 1) * 12}px`,
        }}
      >
        {layoutWidgets.map((widget, i) => {
          const pos = getGridPos(widget);
          const Icon = WIDGET_ICONS[widget.widgetType] || BarChart3;
          const colorClasses = WIDGET_COLORS[widget.widgetType] || WIDGET_COLORS.chart_bar;
          return (
            <motion.div
              key={widget.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              style={{
                gridColumn: `${pos.x + 1} / span ${pos.w}`,
                gridRow: `${pos.y + 1} / span ${pos.h}`,
              }}
            >
              <Card className="h-full p-4 overflow-hidden">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colorClasses}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm truncate">{widget.title}</h4>
                </div>
                <WidgetErrorBoundary title={widget.title}>
                  <DashboardWidgetPreview
                    type={widget.widgetType}
                    config={widget.config}
                    entityId={widget.entityId}
                    enabled={widgetEnabled[i] ?? false}
                  />
                </WidgetErrorBoundary>
              </Card>
            </motion.div>
          );
        })}
      </div>}

      {/* פעולות מהירות */}
      <div>
        <h3 className="text-lg font-bold text-foreground mb-4">פעולות מהירות</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {QUICK_ACTIONS.map((action, i) => (
            <motion.div
              key={`dyn-quick-action-${i}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
            >
              <button
                onClick={() => navigate(action.href)}
                className="w-full flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/50 transition-all group"
              >
                <div className={`p-3 rounded-xl bg-gradient-to-br ${action.color} group-hover:scale-110 transition-transform`}>
                  <action.icon className="w-5 h-5 text-foreground" />
                </div>
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</span>
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardWidgetPreview({ type, config, entityId, enabled = true }: { type: string; config: WidgetJsonb; entityId: number | null; enabled?: boolean }) {
  const { data: widgetData, isLoading, isError, refetch } = useQuery({
    queryKey: ["home-widget-data", type, entityId, JSON.stringify(config)],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/platform/dashboard-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetType: type, entityId, config }),
      });
      if (!r.ok) return null;
      return r.json();
    }),
    enabled,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  if (!enabled || isLoading) {
    return <div className="h-16 flex items-center justify-center animate-pulse"><div className="h-8 w-24 rounded bg-muted/20" /></div>;
  }

  if (isError) {
    return (
      <div className="h-16 flex flex-col items-center justify-center gap-1 text-muted-foreground">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <span className="text-xs opacity-60">שגיאה בטעינת נתונים</span>
        <button
          onClick={() => refetch()}
          className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
        >
          <RefreshCw className="w-3 h-3" />
          נסה שוב
        </button>
      </div>
    );
  }

  if (widgetData === null) {
    return (
      <div className="h-16 flex flex-col items-center justify-center gap-1 text-muted-foreground">
        <AlertTriangle className="w-4 h-4 opacity-50" />
        <span className="text-xs opacity-60">אין נתונים זמינים</span>
      </div>
    );
  }

  if (type === "kpi_card") {
    const value = widgetData?.value ?? config?.value ?? "—";
    return (
      <div className="text-center py-2">
        <p className="text-xl sm:text-3xl font-bold text-primary">{typeof value === "number" ? value.toLocaleString() : String(value)}</p>
        <p className="text-xs text-muted-foreground mt-1">{widgetData?.label || config?.label || "KPI"}</p>
        {config?.change != null && (
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
      return <div className="h-24 mt-2 flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>;
    }
    return (
      <div className="mt-2">
        <div className="flex items-end gap-1 h-28">
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
      return <div className="h-20 mt-2 flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>;
    }
    const maxVal = Math.max(...data, 1);
    const points = data.map((v: number, i: number) => `${(i / Math.max(data.length - 1, 1)) * 100},${40 - (v / maxVal) * 35}`).join(" ");
    return (
      <div className="h-24 mt-2 flex items-center justify-center">
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
      return <div className="h-20 mt-2 flex items-center justify-center text-xs text-muted-foreground">אין נתונים</div>;
    }
    let offset = 0;
    const circumference = 2 * Math.PI * 15;
    return (
      <div className="flex items-center gap-3 mt-2">
        <svg viewBox="0 0 40 40" className="w-20 h-20 flex-shrink-0">
          {data.map((val: number, i: number) => {
            const pct = (val / total) * circumference;
            const el = <circle key={i} cx="20" cy="20" r="15" fill="none" stroke={colors[i % colors.length]} strokeWidth="8" strokeDasharray={`${pct} ${circumference - pct}`} strokeDashoffset={-offset} transform="rotate(-90 20 20)" />;
            offset += pct;
            return el;
          })}
        </svg>
        <div className="space-y-1 text-xs overflow-hidden">
          {labels.slice(0, 5).map((l: string, i: number) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
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
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30">
              {(tblFields as Array<{ slug: string; name: string }>).slice(0, 4).map(f => (
                <th key={f.slug} className="px-2 py-1.5 text-right font-medium text-muted-foreground">{f.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(records as Array<{ id: number; data: Record<string, unknown> }>).slice(0, 5).map(rec => (
              <tr key={rec.id} className="border-t border-border/30">
                {(tblFields as Array<{ slug: string; name: string }>).slice(0, 4).map(f => (
                  <td key={f.slug} className="px-2 py-1.5 truncate max-w-[100px]">{String((rec.data || {})[f.slug] ?? "-")}</td>
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
      create: "נוצר", update: "עודכן", delete: "נמחק",
      status_change: "שינוי סטטוס", publish: "פורסם", unpublish: "הוחזר לטיוטה",
    };
    return (
      <div className="mt-2 space-y-2 overflow-y-auto" style={{ maxHeight: "200px" }}>
        {(logs as Array<{ id: number; action: string; createdAt: string }>).slice(0, 10).map(log => (
          <div key={log.id} className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${log.action === "create" ? "bg-green-400" : log.action === "delete" ? "bg-red-400" : "bg-blue-400"}`} />
            <span className="text-muted-foreground">{actionLabels[log.action] || log.action}</span>
            <span className="text-muted-foreground/60 mr-auto">{new Date(log.createdAt).toLocaleDateString("he-IL")}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="h-16 flex flex-col items-center justify-center gap-1 text-muted-foreground">
      <Hash className="w-4 h-4 opacity-40" />
      <span className="text-xs opacity-50">בקרוב</span>
    </div>
  );
}

interface CrmDashboard {
  quotesStats?: { total?: number; approved?: number; total_value?: number; approved_value?: number; overdue_count?: number };
  invoiceStats?: { total?: number; total_value?: number; paid_value?: number; overdue_count?: number };
  conversionFunnel?: { total_leads?: number; total_quotes?: number; approved_quotes?: number; total_orders?: number; total_invoices?: number };
  recentCustomers?: Array<{ id: number; data: Record<string, unknown>; status: string; created_at: string }>;
}

interface PlatformModule {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  description?: string;
  recordCount?: number;
}

interface HrDashboard {
  employees?: { total_employees?: number; active_employees?: number; on_leave?: number };
}

interface DepartmentStat {
  department: string;
  count: number;
}

function StaticDashboard({ navigate }: { navigate: (path: string) => void }) {
  const authHeaders = () => {
    const token = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
    return { Authorization: `Bearer ${token}` };
  };

  const { data: aggregatedStats, error: aggregatedStatsError, isSuccess: aggregatedStatsLoaded, refetch: refetchAggregatedStats } = useQuery({
    queryKey: ["dashboard-aggregated-stats"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/dashboard-stats`, { headers: authHeaders() });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      return r.json();
    }),
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: summary } = useQuery({
    queryKey: ["builder-schema-summary"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch("/api/claude/knowledge/schema-summary", { headers: authHeaders() });
      if (!r.ok) return {};
      return r.json();
    }),
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: crmDashboard } = useQuery<CrmDashboard>({
    queryKey: ["dashboard-crm"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/crm/dashboard`, { headers: authHeaders() });
      if (!r.ok) return {};
      return r.json();
    }),
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { modules: platformModules } = usePlatformModules();

  const { data: hrDashboard } = useQuery<HrDashboard>({
    queryKey: ["dashboard-hr"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/hr/dashboard`, { headers: authHeaders() });
      if (!r.ok) return {};
      return r.json();
    }),
    enabled: aggregatedStatsLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: departments } = useQuery<DepartmentStat[]>({
    queryKey: ["dashboard-departments"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/hr/departments`, { headers: authHeaders() });
      if (!r.ok) return [];
      return r.json();
    }),
    enabled: aggregatedStatsLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const agg = aggregatedStats || {} as any;
  const totals = summary?.totals || {};
  const wo = { total: agg.totalWorkOrders || 0, in_progress: agg.activeWorkOrders || 0 };
  const products: unknown[] = [];
  const materials: RawMaterialItem[] = [];
  const lowStockMaterials: RawMaterialItem[] = [];
  const suppliers = new Array(agg.totalSuppliers || 0);
  const purchaseOrders = new Array(agg.totalPurchaseOrders || 0);
  const salesOrders = new Array(agg.totalOrders || 0);
  const customers = new Array(agg.totalCustomers || 0);
  const salesInvoices = new Array(agg.totalInvoices || 0);
  const installationRecords: Array<{ id: number; status: string; data: Record<string, unknown> }> = [];
  const moduleEntityCounts: Record<number, number> = {};

  const crm = crmDashboard || {};
  const quotes = crm.quotesStats || {};
  const invoices = crm.invoiceStats || {};
  const funnel = crm.conversionFunnel || {};
  const recentCustomers = Array.isArray(crm.recentCustomers) ? crm.recentCustomers : [];
  const modules = Array.isArray(platformModules) ? platformModules : [];
  const hr = hrDashboard?.employees || {};
  const depts = Array.isArray(departments) ? departments : [];
  const installations = Array.isArray(installationRecords) ? installationRecords : [];
  const modCounts = moduleEntityCounts || {};

  const totalOrders = Number(funnel.total_orders || 0);
  const approvedQuotes = Number(funnel.approved_quotes || 0);
  const totalQuotes = Number(funnel.total_quotes || 0);
  const salesSuccessRate = totalQuotes > 0 ? Math.round((approvedQuotes / totalQuotes) * 100) : 0;

  const totalInvoiceValue = Number(invoices.total_value || 0);
  const totalInvoiceCount = Number(invoices.total || 0);
  const avgOrderSize = totalInvoiceCount > 0 ? Math.round(totalInvoiceValue / totalInvoiceCount) : 0;

  const woTotal = Number(wo.total || 0);
  const woCompleted = Number(wo.completed || 0);
  const productionRate = woTotal > 0 ? Math.round((woCompleted / woTotal) * 100) : 0;

  const instalTotal = installations.length;
  const instalPlanned = installations.filter(r => r.status === "planned" || r.status === "draft").length;
  const instalActive = installations.filter(r => r.status === "active" || r.status === "in_progress").length;
  const instalCompleted = installations.filter(r => r.status === "completed" || r.status === "done").length;
  const instalOnHold = installations.filter(r => r.status === "on_hold" || r.status === "paused").length;

  const planningUnderstandRate = instalTotal > 0 ? Math.round((instalCompleted / instalTotal) * 100) : 0;

  const factoryStats = [
    { label: "הוראות עבודה פעילות", value: (wo.in_progress || 0), icon: ClipboardList, color: "text-amber-500", bg: "bg-amber-500/10", href: "/production/work-orders" },
    { label: "הוראות מתוכננות", value: (wo.planned || 0), icon: Factory, color: "text-blue-500", bg: "bg-blue-500/10", href: "/production/work-orders" },
    { label: "הושלמו החודש", value: (wo.completed || 0), icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", href: "/production/work-orders" },
    { label: "לקוחות", value: customers.length, icon: Building2, color: "text-pink-500", bg: "bg-pink-500/10", href: "/sales/customers" },
    { label: "ספקים", value: suppliers.length, icon: Truck, color: "text-orange-500", bg: "bg-orange-500/10", href: "/suppliers" },
    { label: "מוצרים בקטלוג", value: products.length, icon: Package, color: "text-purple-500", bg: "bg-purple-500/10", href: "/product-catalog" },
    { label: "חומרי גלם", value: materials.length, icon: Boxes, color: "text-cyan-500", bg: "bg-cyan-500/10", href: "/raw-materials" },
    { label: "מלאי נמוך", value: lowStockMaterials.length, icon: AlertTriangle, color: lowStockMaterials.length > 0 ? "text-red-500" : "text-green-500", bg: lowStockMaterials.length > 0 ? "bg-red-500/10" : "bg-green-500/10", href: "/raw-materials" },
    { label: "הזמנות רכש", value: purchaseOrders.length, icon: ShoppingCart, color: "text-violet-500", bg: "bg-violet-500/10", href: "/purchase-orders" },
    { label: "הזמנות מכירה", value: salesOrders.length, icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10", href: "/sales/orders" },
    { label: "חשבוניות", value: salesInvoices.length, icon: Receipt, color: "text-teal-500", bg: "bg-teal-500/10", href: "/sales/invoicing" },
    { label: "רשומות במערכת", value: totals.records || 0, icon: Database, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  ];

  const quickActions = QUICK_ACTIONS;

  const pieColors = ["#a855f7", "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#ec4899"];
  const dealTypes = [
    { label: "חשבוניות", value: salesInvoices.length || Number(invoices.total || 0) },
    { label: "הצעות מחיר", value: Number(quotes.total || 0) },
    { label: "הזמנות מכירה", value: salesOrders.length || totalOrders },
    { label: "הזמנות רכש", value: purchaseOrders.length },
    { label: "לידים", value: Number(funnel.total_leads || 0) },
  ].filter(d => d.value > 0);
  const dealTotal = dealTypes.reduce((s, d) => s + d.value, 0) || 1;

  const productionStatusBars = [
    { label: "מתוכנן", value: Number(wo.planned || 0), color: "bg-blue-500" },
    { label: "בביצוע", value: Number(wo.in_progress || 0), color: "bg-amber-500" },
    { label: "הושלם", value: Number(wo.completed || 0), color: "bg-emerald-500" },
    { label: "מושהה", value: Number(wo.on_hold || 0), color: "bg-orange-500" },
    { label: "ביטוח איכות", value: Number(wo.quality_check || 0), color: "bg-purple-500" },
  ];
  const prodMax = Math.max(...productionStatusBars.map(b => b.value), 1);

  const moduleIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    campaigns: Megaphone, deals: DollarSign, goals: Target, departments: Building2,
    personal: Users, ai: Bot, sales: ShoppingCart, hr: Users, finance: Receipt,
    production: Factory, inventory: Boxes, crm: Activity, reports: BarChart3,
    settings: Settings, customers: Building2, suppliers: Truck, products: Package,
  };

  function getModuleIcon(mod: PlatformModule): React.ComponentType<{ className?: string }> {
    const slug = mod.slug?.toLowerCase() || "";
    for (const [key, Icon] of Object.entries(moduleIcons)) {
      if (slug.includes(key)) return Icon;
    }
    return Star;
  }

  const moduleColors = [
    "from-purple-600 to-violet-600", "from-blue-600 to-indigo-600", "from-amber-600 to-orange-600",
    "from-emerald-600 to-green-600", "from-pink-600 to-rose-600", "from-cyan-600 to-blue-600",
    "from-red-600 to-rose-600", "from-teal-600 to-cyan-600", "from-lime-600 to-green-600",
    "from-sky-600 to-blue-600", "from-fuchsia-600 to-purple-600", "from-orange-600 to-amber-600",
  ];

  const summaryStats = [
    {
      label: "ייצור",
      total: Number(wo.total || 0), pending: Number(wo.planned || 0), started: Number(wo.in_progress || 0), inProgress: Number(wo.quality_check || 0), retained: Number(wo.on_hold || 0),
      color: "text-amber-400", bg: "bg-amber-500/10",
    },
    {
      label: "מכירות",
      total: salesOrders.length + salesInvoices.length, pending: salesOrders.length, started: salesInvoices.length, inProgress: Number(quotes.approved || 0), retained: Number(invoices.overdue_count || 0),
      color: "text-emerald-400", bg: "bg-emerald-500/10",
    },
    {
      label: "רכש וספקים",
      total: purchaseOrders.length + suppliers.length, pending: purchaseOrders.length, started: suppliers.length, inProgress: 0, retained: 0,
      color: "text-purple-400", bg: "bg-purple-500/10",
    },
    {
      label: "התקנות",
      total: instalTotal, pending: instalPlanned, started: instalActive, inProgress: instalCompleted, retained: instalOnHold,
      color: "text-blue-400", bg: "bg-blue-500/10",
    },
  ];

  const deptIconMap: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    "ייצור": { icon: Factory, color: "from-indigo-600 to-blue-600" },
    "התקנות": { icon: Wrench, color: "from-amber-600 to-orange-600" },
    "מכירות": { icon: ShoppingCart, color: "from-pink-600 to-rose-600" },
    "הנדסה": { icon: Wrench, color: "from-cyan-600 to-blue-600" },
    "משרד": { icon: Building2, color: "from-purple-600 to-violet-600" },
    "הנהלה": { icon: Star, color: "from-yellow-600 to-amber-600" },
    "כספים": { icon: Receipt, color: "from-emerald-600 to-green-600" },
    "מדידות": { icon: Ruler, color: "from-blue-600 to-cyan-600" },
    "מחסן": { icon: Boxes, color: "from-orange-600 to-amber-600" },
    "איכות": { icon: Shield, color: "from-green-600 to-emerald-600" },
    "תפעול": { icon: Settings, color: "from-red-600 to-rose-600" },
    "שירות לקוחות": { icon: Users, color: "from-blue-600 to-cyan-600" },
  };

  const deptDetails = depts.length > 0
    ? depts.map(d => ({
        name: d.department,
        count: d.count,
        icon: deptIconMap[d.department]?.icon || Users,
        color: deptIconMap[d.department]?.color || "from-slate-600 to-gray-600",
      }))
    : [];

  const overdueTaskCount = Number(wo.on_hold || 0) + Number(invoices.overdue_count || 0);
  const completedToday = Number(wo.completed || 0);
  const pipelineValue = Number(quotes.total_value || 0) + Number(invoices.total_value || 0);
  const pipelineDeals = salesOrders.length + salesInvoices.length + Number(quotes.total || 0);
  const activeUsers = Number(hr.active_employees || 0);
  const activeDeals = pipelineDeals || 0;
  const overallStatus = woTotal > 0 ? Math.round(((woCompleted + Number(wo.in_progress || 0)) / woTotal) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Dashboard stats error banner */}
      {aggregatedStatsError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400" dir="rtl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>שגיאה בטעינת נתוני הדשבורד — חלק מהנתונים עשויים להיות חסרים.</span>
          </div>
          <button
            onClick={() => refetchAggregatedStats()}
            className="flex items-center gap-1.5 text-xs font-medium text-red-300 hover:text-red-200 underline whitespace-nowrap"
          >
            <RefreshCw className="w-3 h-3" />
            נסה שוב
          </button>
        </div>
      )}
      {/* Empty-state banner — shown when stats loaded successfully but DB has no records yet */}
      {!aggregatedStatsError && aggregatedStats && (
        (() => {
          const s = aggregatedStats as any;
          const isEmpty = !s.totalCustomers && !s.totalEmployees && !s.totalOrders && !s.totalWorkOrders && !s.totalInvoices && !s.totalPurchaseOrders;
          return isEmpty ? (
            <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
              <Database className="w-4 h-4 flex-shrink-0" />
              <span>מסד הנתונים ריק כרגע — אין נתונים להצגה. התחל ליצור לקוחות, הזמנות ועובדים כדי לראות נתונים חיים בדשבורד.</span>
            </div>
          ) : null;
        })()
      )}
      {/* Live Activity Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden border border-border/60"
        style={{
          background: "linear-gradient(135deg, rgba(30,27,46,0.95) 0%, rgba(20,18,35,0.98) 100%)",
        }}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-foreground tracking-tight">מעקב פעילות בזמן אמת</h1>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">סטטוס:</span>
              <span className="font-bold text-foreground">{overallStatus}%</span>
            </div>
            <div className="h-6 w-px bg-border/50" />
            <div className="flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground">{activeDeals} עסקאות/פעילה</span>
            </div>
            <div className="h-6 w-px bg-border/50" />
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-cyan-400" />
              <span className="text-muted-foreground">{activeUsers} משתמשים פעילים</span>
            </div>
            <div className="h-6 w-px bg-border/50" />
            <span className="px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5 border border-emerald-500/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              Live
            </span>
            <button
              onClick={() => navigate("/operations-control-center")}
              className="flex items-center gap-2 px-4 py-2 text-sm text-foreground bg-card/10 hover:bg-card/15 rounded-xl transition-colors border border-white/10"
            >
              <Radio className="w-4 h-4" />
              מוכן לפעולה...
            </button>
          </div>
        </div>
      </motion.div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground tracking-tight">טכנו-כל עוזי</h1>
          <p className="text-muted-foreground mt-1">מפעל מסגרות ברזל, אלומיניום, נירוסטה וזכוכית</p>
        </div>
        <button
          onClick={() => navigate("/builder/dashboards")}
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-xl transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
          דשבורד מותאם
        </button>
      </div>

      {/* 3 Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div
            className="relative overflow-hidden rounded-2xl p-5 cursor-pointer group transition-all hover:scale-[1.01]"
            style={{ background: "linear-gradient(135deg, #dc2626 0%, #ea580c 100%)" }}
            onClick={() => navigate("/production/work-orders")}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-card/20 text-foreground mb-2 inline-block">דחוף</span>
                <h4 className="text-foreground font-bold text-base mt-1">משימות באיחור</h4>
                <p className="text-foreground/70 text-xs mt-1">{overdueTaskCount} משימות שעברו את מועד היעד</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-card/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-foreground" />
              </div>
            </div>
            <button className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground bg-card/20 hover:bg-card/30 px-3 py-1.5 rounded-lg transition-colors">
              טפל עכשיו
              <ArrowLeft className="w-3 h-3" />
            </button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div
            className="relative overflow-hidden rounded-2xl p-5 cursor-pointer group transition-all hover:scale-[1.01]"
            style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
            onClick={() => navigate("/sales/quotations")}
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-foreground font-bold text-base">ערך צברת עסקאות</h4>
                <p className="text-foreground text-lg sm:text-2xl font-bold mt-1">₪{pipelineValue.toLocaleString("he-IL")}</p>
                <p className="text-foreground/70 text-xs mt-1">{pipelineDeals} עסקאות פתוחות</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-card/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-foreground" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div
            className="relative overflow-hidden rounded-2xl p-5 cursor-pointer group transition-all hover:scale-[1.01]"
            style={{ background: "linear-gradient(135deg, #059669 0%, #34d399 100%)" }}
            onClick={() => navigate("/production/work-orders")}
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-foreground font-bold text-base">משימות שהושלמו היום</h4>
                <p className="text-foreground text-lg sm:text-2xl font-bold mt-1">{completedToday}</p>
                <p className="text-foreground/70 text-xs mt-1">{completedToday} משימות שהושלמו בהצלחה</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-card/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-foreground" />
              </div>
            </div>
            <button
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground bg-card/20 hover:bg-card/30 px-3 py-1.5 rounded-lg transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate("/production/work-orders"); }}
            >
              כל המשימות
              <ArrowLeft className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* KPIs משמעותיים */}
      <div>
        <h3 className="text-base font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          KPIs עסקיים מרכזיים
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "אחוז הצלחת מכירות", value: `${salesSuccessRate}%`, sub: `${approvedQuotes} מאושרות מתוך ${totalQuotes}`, icon: Percent, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
            { label: "ממוצע גודל הזמנה", value: totalInvoiceCount > 0 ? `₪${avgOrderSize.toLocaleString("he-IL")}` : "—", sub: `סה״כ ${totalInvoiceCount} חשבוניות`, icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
            { label: "קצב מימוש ייצור", value: `${productionRate}%`, sub: `${woCompleted} הושלמו מתוך ${woTotal}`, icon: Factory, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
            { label: "אחוז הבנת תכנונית", value: `${planningUnderstandRate}%`, sub: `${instalCompleted} התקנות הושלמו מתוך ${instalTotal}`, icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
          ].map((kpi, i) => (
            <motion.div key={`kpi-${i}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className={`p-6 border ${kpi.border}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${kpi.bg}`}>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                </div>
                <p className="text-xl sm:text-3xl font-bold text-foreground mb-1">{kpi.value}</p>
                <p className="text-sm font-medium text-foreground/80 mb-0.5">{kpi.label}</p>
                <p className="text-xs text-muted-foreground">{kpi.sub}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Factory stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {factoryStats.map((stat, i) => (
          <motion.div
            key={`factory-stat-${i}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card
              className={`p-5 relative overflow-hidden group transition-all ${stat.href ? "cursor-pointer hover:border-primary/50" : ""}`}
              onClick={() => stat.href && navigate(stat.href)}
            >
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <h3 className="text-lg sm:text-2xl font-bold text-foreground">{stat.value}</h3>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* גרפים: עוגה + עמודות — Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-3 sm:p-6">
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-purple-400" />
              פילוח עסקאות
            </h3>
            <p className="text-xs text-muted-foreground mb-4">סוגי עסקאות פעילות במערכת</p>
            {dealTypes.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPieChart>
                  <Pie
                    data={dealTypes}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    innerRadius={45}
                    paddingAngle={3}
                  >
                    {dealTypes.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                    formatter={(value: number, name: string) => [`${value} (${Math.round(value / dealTotal * 100)}%)`, name]}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontSize: 11, color: "hsl(215,20%,65%)" }}>{value}</span>} />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">אין נתונים</div>
            )}
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="p-3 sm:p-6">
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              סטטוס ייצור
            </h3>
            <p className="text-xs text-muted-foreground mb-4">הוראות עבודה לפי סטטוס</p>
            {productionStatusBars.some(b => b.value > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={productionStatusBars} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215,20%,65%)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(215,20%,65%)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="value" name="כמות" radius={[4, 4, 0, 0]}>
                    {productionStatusBars.map((bar, i) => {
                      const colorMap: Record<string, string> = { "bg-blue-500": "#3b82f6", "bg-amber-500": "#f59e0b", "bg-emerald-500": "#10b981", "bg-orange-500": "#f97316", "bg-purple-500": "#a855f7" };
                      return <Cell key={i} fill={colorMap[bar.color] || "#3b82f6"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <BarChart2 className="w-9 h-9 opacity-20" />
                <p className="text-sm">אין נתוני ייצור עדיין</p>
                <p className="text-xs opacity-60">יתעדכן כשיהיו נתונים במערכת</p>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* פעולות מהירות */}
      <div>
        <h3 className="text-lg font-bold text-foreground mb-4">פעולות מהירות</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action, i) => (
            <motion.div
              key={`quick-action-${i}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
            >
              <button
                onClick={() => navigate(action.href)}
                className="w-full flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/50 transition-all group"
              >
                <div className={`p-3 rounded-xl bg-gradient-to-br ${action.color} group-hover:scale-110 transition-transform`}>
                  <action.icon className="w-5 h-5 text-foreground" />
                </div>
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</span>
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* פעילות אחרונה + מודולים */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="p-3 sm:p-6">
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <Activity className="w-4 h-4 text-yellow-400" />
              פעילות אחרונה
            </h3>
            <p className="text-xs text-muted-foreground mb-4">הזמנות ועסקאות אחרונות</p>
            {recentCustomers.length > 0 ? (
              <div className="space-y-2">
                {recentCustomers.slice(0, 6).map((rec, i) => {
                  const d = rec.data || {};
                  const name = String(d.name || d.company_name || d.customer_name || "לקוח");
                  const orderNum = d.order_number || d.quote_number || d.invoice_number || d.document_number || d.reference_number || `#${rec.id}`;
                  const amount = d.total_amount ? `₪${Number(d.total_amount).toLocaleString("he-IL")}` : null;
                  const status = rec.status || "draft";
                  const statusColors: Record<string, string> = { active: "bg-emerald-500/20 text-emerald-400", approved: "bg-emerald-500/20 text-emerald-400", pending: "bg-amber-500/20 text-amber-400", draft: "bg-muted/50 text-muted-foreground", rejected: "bg-red-500/20 text-red-400", overdue: "bg-red-500/20 text-red-400" };
                  const statusLabels: Record<string, string> = { active: "פעיל", approved: "מאושר", pending: "ממתין", draft: "טיוטה", rejected: "נדחה", overdue: "פג תוקף" };
                  return (
                    <div key={`rec-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-card/[0.02] border border-border/30 hover:border-border/60 transition-colors">
                      <div className="flex-shrink-0">
                        {amount && <span className="text-sm font-bold text-emerald-400">{amount}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">{String(orderNum)}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-lg flex-shrink-0 ${statusColors[status] || "bg-muted/50 text-muted-foreground"}`}>
                        {statusLabels[status] || status}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">אין פעילות אחרונה</p>
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="p-3 sm:p-6">
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-cyan-400" />
              מודולים במערכת
            </h3>
            <p className="text-xs text-muted-foreground mb-4">מודולים זמינים בפלטפורמה</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {modules.slice(0, 9).map((mod, i) => {
                const Icon = getModuleIcon(mod);
                const count = modCounts[mod.id];
                return (
                  <button
                    key={mod.id}
                    onClick={() => navigate(`/builder/module/${mod.id}`)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card/[0.02] border border-border/30 hover:border-primary/40 transition-all group"
                  >
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${moduleColors[i % moduleColors.length]} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <Icon className="w-4 h-4 text-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors text-center leading-tight line-clamp-2">{mod.name}</span>
                    {count !== undefined && (
                      <span className="text-[10px] text-muted-foreground/60 font-medium">{count} רשומות</span>
                    )}
                  </button>
                );
              })}
              {modules.length === 0 && (
                <div className="col-span-3 text-center py-6 text-muted-foreground">
                  <LayoutGrid className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">אין מודולים</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* שורת סיכום סטטיסטי - טבלה בסגנון Base44 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryStats.map((s, i) => {
            const dailyRate = s.total > 0 ? ((s.inProgress / s.total) * 100).toFixed(1) : "0.0";
            const completionRate = s.total > 0 ? ((s.started / s.total) * 100).toFixed(1) : "0.0";
            return (
              <motion.div key={`ss-${i}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 + i * 0.05 }}>
                <Card className="overflow-hidden">
                  <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-bold text-amber-300">{s.label}</span>
                  </div>
                  <div className="p-0">
                    <table className="w-full text-xs">
                      <tbody>
                        <tr className="border-b border-border/30">
                          <td className="px-3 py-2 text-muted-foreground">סה״כ</td>
                          <td className="px-3 py-2 text-left font-bold text-foreground">{s.total}</td>
                        </tr>
                        <tr className="border-b border-border/30">
                          <td className="px-3 py-2 text-muted-foreground">ממתין</td>
                          <td className="px-3 py-2 text-left font-medium">{s.pending}</td>
                        </tr>
                        <tr className="border-b border-border/30">
                          <td className="px-3 py-2 text-muted-foreground">בתהליך</td>
                          <td className="px-3 py-2 text-left font-medium">{s.started}</td>
                        </tr>
                        <tr className="border-b border-border/30">
                          <td className="px-3 py-2 text-muted-foreground">הושלם</td>
                          <td className="px-3 py-2 text-left font-medium">{s.inProgress}</td>
                        </tr>
                        <tr className="border-b border-border/30">
                          <td className="px-3 py-2 text-muted-foreground">קצב ביצוע</td>
                          <td className="px-3 py-2 text-left font-bold text-emerald-400">{dailyRate}%</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-muted-foreground">קצב סיום</td>
                          <td className="px-3 py-2 text-left font-bold text-blue-400">{completionRate}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* 4 ספירות ישויות */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="p-5 cursor-pointer hover:border-primary/50 transition-all" onClick={() => navigate("/product-catalog")}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center">
                <Package className="w-4 h-4 text-foreground" />
              </div>
              <span className="text-sm font-bold text-foreground">מוצרים</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">סה״כ</span><span className="font-bold text-foreground text-sm">{products.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">בקטלוג</span><span className="font-medium">{products.length}</span></div>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
          <Card className="p-5 cursor-pointer hover:border-primary/50 transition-all" onClick={() => navigate("/hr/employees")}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                <Users className="w-4 h-4 text-foreground" />
              </div>
              <span className="text-sm font-bold text-foreground">עובדים</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">סה״כ</span><span className="font-bold text-foreground text-sm">{Number(hr.total_employees || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">פעילים</span><span className="font-medium">{Number(hr.active_employees || 0)}</span></div>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="p-5 cursor-pointer hover:border-primary/50 transition-all" onClick={() => navigate("/sales/customers")}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-green-600 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-foreground" />
              </div>
              <span className="text-sm font-bold text-foreground">לקוחות</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">סה״כ</span><span className="font-bold text-foreground text-sm">{customers.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">פעילים</span><span className="font-medium">{customers.filter((c: any) => c.status === "active" || c.status === "approved").length || customers.length}</span></div>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}>
          <Card className="p-5 cursor-pointer hover:border-primary/50 transition-all" onClick={() => navigate("/crm/leads")}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
                <Target className="w-4 h-4 text-foreground" />
              </div>
              <span className="text-sm font-bold text-foreground">לידים</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">סה״כ לידים</span><span className="font-bold text-foreground text-sm">{Number(funnel.total_leads || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">הצעות מחיר</span><span className="font-medium">{Number(funnel.total_quotes || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">הזמנות</span><span className="font-medium">{Number(funnel.total_orders || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">המרה</span><span className="font-bold text-emerald-400">{salesSuccessRate > 0 ? `${salesSuccessRate}%` : "—"}</span></div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* סטטיסטיקות מחלקות - טבלה בסגנון Base44 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-foreground">סטטיסטיקות מחלקות</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-500/5 border-b border-amber-500/20">
                  <th className="px-4 py-3 text-right text-xs font-bold text-amber-300">מחלקה</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-amber-300">עובדים</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-amber-300">תקינות</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-amber-300">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {deptDetails.length > 0 ? deptDetails.map((dept, i) => {
                  const DeptIcon = dept.icon;
                  const isActive = dept.count > 0;
                  return (
                    <tr key={`dept-${i}`} className="border-b border-border/20 hover:bg-card/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${dept.color} flex items-center justify-center flex-shrink-0`}>
                            <DeptIcon className="w-3.5 h-3.5 text-foreground" />
                          </div>
                          <span className="text-xs font-medium text-foreground">{dept.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-foreground text-xs">{dept.count}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-xs text-emerald-400">{dept.count}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/50 text-muted-foreground"}`}>
                          {isActive ? "פעיל" : "לא פעיל"}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">אין נתוני מחלקות</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* ייצור וחומרים */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              <Factory className="w-5 h-5 text-blue-400" />
              סקירת ייצור
            </h3>
            <p className="text-sm text-muted-foreground mb-4">סיכום סטטוס הייצור הנוכחי</p>
            <div className="space-y-3">
              {[
                { label: "סה״כ הוראות עבודה", value: wo.total || 0, color: "text-blue-400" },
                { label: "בייצור כרגע", value: wo.in_progress || 0, color: "text-amber-400" },
                { label: "ממתינות לתחילה", value: wo.planned || 0, color: "text-cyan-400" },
                { label: "מושהות", value: wo.on_hold || 0, color: "text-orange-400" },
                { label: "הושלמו", value: wo.completed || 0, color: "text-green-400" },
                { label: "בבדיקת איכות", value: wo.quality_check || 0, color: "text-purple-400" },
                { label: "עלות כוללת", value: `₪${Number(wo.total_cost || 0).toLocaleString("he-IL")}`, color: "text-emerald-400" },
              ].map((item, idx) => (
                <div key={`prod-stat-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-card/[0.02] border border-border/30">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className={`text-lg font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}>
          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              חומרים במלאי נמוך
            </h3>
            <p className="text-sm text-muted-foreground mb-4">חומרי גלם שהגיעו לנקודת הזמנה מחדש</p>
            {lowStockMaterials.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400 opacity-50" />
                <p className="text-sm">כל החומרים במלאי תקין</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {lowStockMaterials.slice(0, 10).map(mat => (
                  <div key={mat.id} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                    <div>
                      <span className="text-sm font-medium text-foreground">{mat.materialName}</span>
                      <span className="text-xs text-muted-foreground mr-2">({mat.category})</span>
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-bold text-red-400">{parseFloat(mat.currentStock || "0").toFixed(0)}</span>
                      <span className="text-xs text-muted-foreground"> / {parseFloat(mat.reorderPoint || "0").toFixed(0)} {mat.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* באנרים התראות */}
      <div className="space-y-3">
        {lowStockMaterials.length > 0 && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }}>
            <div
              className="flex items-center gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 cursor-pointer hover:bg-amber-500/15 transition-colors"
              onClick={() => navigate("/raw-materials")}
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">התראת מלאי נמוך</p>
                <p className="text-xs text-amber-400/80">{lowStockMaterials.length} פריטים במלאי נמוך — נדרשת הזמנה מחדש</p>
              </div>
              <span className="text-xs text-amber-400 bg-amber-500/20 px-3 py-1.5 rounded-lg font-medium">לטיפול</span>
            </div>
          </motion.div>
        )}
        {Number(invoices.overdue_count || 0) > 0 && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.85 }}>
            <div
              className="flex items-center gap-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 cursor-pointer hover:bg-red-500/15 transition-colors"
              onClick={() => navigate("/sales/invoicing")}
            >
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300">חשבוניות באיחור</p>
                <p className="text-xs text-red-400/80">{invoices.overdue_count} חשבוניות שלא שולמו במועד — דרוש טיפול</p>
              </div>
              <span className="text-xs text-red-400 bg-red-500/20 px-3 py-1.5 rounded-lg font-medium">דחוף</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
