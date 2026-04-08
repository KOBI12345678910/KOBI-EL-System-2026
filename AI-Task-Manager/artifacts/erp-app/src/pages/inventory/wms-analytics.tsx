import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, BarChart3, TrendingUp, TrendingDown, AlertTriangle,
  Package, RefreshCw, CheckCircle2, XCircle, MoreHorizontal, Download,
  Activity, Gauge, Layers, Clock, Target, Brain, Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, RadialBarChart, RadialBar,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell
} from "recharts";
import { authJson, authFetch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function fmtNum(v: number) { return Math.abs(v).toLocaleString("he-IL", { maximumFractionDigits: 0 }); }
function fmtPct(v: number) { return `${Math.round(v * 10) / 10}%`; }
function fmtIls(v: number) { return `₪${fmtNum(v)}`; }

type Tab = "kpis" | "forecast" | "reorder" | "dead-stock";

function KPICard({ label, value, sub, color = "text-foreground", trend, icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; trend?: "up" | "down" | null; icon?: React.ElementType;
}) {
  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            {Icon && <Icon className={`w-5 h-5 ${color}`} />}
            {trend === "up" && <TrendingUp className="w-4 h-4 text-green-400" />}
            {trend === "down" && <TrendingDown className="w-4 h-4 text-red-400" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GaugeWidget({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string; }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const data = [{ value: pct, fill: color }, { value: 100 - pct, fill: "#1e293b" }];
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <ResponsiveContainer width={120} height={80}>
          <RadialBarChart cx="50%" cy="90%" innerRadius="60%" outerRadius="100%" startAngle={180} endAngle={0} data={data}>
            <RadialBar dataKey="value" cornerRadius={4} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute bottom-0 left-0 right-0 text-center">
          <p className="text-lg font-bold" style={{ color }}>{Math.round(value)}{max === 100 ? "%" : ""}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-1 max-w-[100px]">{label}</p>
    </div>
  );
}

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))];
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export default function WMSAnalytics() {
  const [activeTab, setActiveTab] = useState<Tab>("kpis");
  const [periodDays, setPeriodDays] = useState(30);
  const [deadStockDays, setDeadStockDays] = useState(180);
  const [forecastLimit, setForecastLimit] = useState(20);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: kpiData, isLoading: kpiLoading, refetch: refetchKpi } = useQuery({
    queryKey: ["wms-kpis", periodDays],
    queryFn: () => authJson(`${API}/warehouse-intelligence/kpis?days=${periodDays}`).catch(() => null),
    staleTime: 60_000,
  });

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ["wms-kpi-trends"],
    queryFn: () => authJson(`${API}/warehouse-intelligence/kpi-trends`).catch(() => []),
    staleTime: 120_000,
  });

  const { data: forecastData, isLoading: forecastLoading, refetch: refetchForecast } = useQuery({
    queryKey: ["wms-forecast-view", forecastLimit],
    queryFn: () => authJson(`${API}/warehouse-intelligence/demand-forecast-view?limit=${forecastLimit}`).catch(() => []),
    staleTime: 60_000,
  });

  const { data: reorderData, isLoading: reorderLoading } = useQuery({
    queryKey: ["wms-reorder-suggestions"],
    queryFn: () => authJson(`${API}/warehouse-intelligence/reorder-suggestions`).catch(() => []),
    staleTime: 60_000,
  });

  const { data: deadStockData, isLoading: deadLoading } = useQuery({
    queryKey: ["wms-dead-stock", deadStockDays],
    queryFn: () => authJson(`${API}/warehouse-intelligence/dead-stock?minDays=${deadStockDays}`).catch(() => []),
    staleTime: 60_000,
  });

  const generateForecastMutation = useMutation({
    mutationFn: () => authFetch(`${API}/warehouse-intelligence/generate-forecasts`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "תחזית נוצרה", description: `עובד על ${data.count || 0} חומרים` });
      qc.invalidateQueries({ queryKey: ["wms-forecast-view"] });
      qc.invalidateQueries({ queryKey: ["wms-reorder-suggestions"] });
    },
    onError: () => toast({ title: "שגיאה", description: "יצירת תחזית נכשלה", variant: "destructive" }),
  });

  const reorderActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "accept" | "dismiss" }) =>
      authFetch(`${API}/warehouse-intelligence/reorder-suggestions/${id}/${action}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionBy: "user" }) }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "עודכן", description: "ההצעה עודכנה בהצלחה" });
      qc.invalidateQueries({ queryKey: ["wms-reorder-suggestions"] });
    },
    onError: () => toast({ title: "שגיאה", variant: "destructive" }),
  });

  const kpi = kpiData || {};
  const zones: { zone: string; skuCount: number; totalQty: number; totalValue: number; avgFillPct: number }[] = kpi.zoneUtilization || [];
  const reorderList: Record<string, unknown>[] = Array.isArray(reorderData) ? reorderData : [];
  const pendingReorders = reorderList.filter((r: Record<string, unknown>) => r.status === "pending");
  const forecasts: Record<string, unknown>[] = Array.isArray(forecastData) ? forecastData : [];
  const deadItems: Record<string, unknown>[] = Array.isArray(deadStockData) ? deadStockData : [];
  const trends: Record<string, unknown>[] = Array.isArray(trendData) ? trendData : [];

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "kpis", label: "KPIs מחסן", icon: Gauge },
    { id: "forecast", label: "תחזית ביקוש", icon: Brain, badge: forecasts.length },
    { id: "reorder", label: "הצעות הזמנה", icon: Target, badge: pendingReorders.length },
    { id: "dead-stock", label: "מלאי דומם", icon: AlertTriangle, badge: deadItems.length },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/inventory/dashboard"><span className="flex items-center gap-1 hover:text-foreground cursor-pointer"><ChevronLeft className="w-4 h-4" />מלאי</span></Link>
        <span>/</span>
        <span className="text-foreground">ניתוח מחסן חכם</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-400" /> ניתוח מחסן חכם — WMS Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">KPIs מחסן, תחזית ביקוש ML, ניתוח מלאי דומם</p>
        </div>
        <div className="flex gap-2">
          <select value={periodDays} onChange={e => setPeriodDays(parseInt(e.target.value))}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-foreground">
            {[7, 14, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} ימים</option>)}
          </select>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => refetchKpi()}>
            <RefreshCw className="w-4 h-4 ml-1" />רענן
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap border-b border-slate-700/50 pb-3">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-emerald-600 text-foreground" : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"}`}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "kpis" && (
        <div className="space-y-5">
          {kpiLoading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Fill Rate" value={fmtPct(kpi.fillRate ?? 0)}
                  color={kpi.fillRate >= 95 ? "text-green-400" : kpi.fillRate >= 85 ? "text-amber-400" : "text-red-400"}
                  sub="שיעור מילוי הזמנות" icon={CheckCircle2} />
                <KPICard label="מחזור מלאי" value={`${(kpi.inventoryTurnover ?? 0).toFixed(2)}x`}
                  color={kpi.inventoryTurnover >= 4 ? "text-green-400" : "text-amber-400"}
                  sub={`פי ${(kpi.inventoryTurnover ?? 0).toFixed(1)} לשנה`} icon={TrendingUp} />
                <KPICard label="עלות החזקה" value={fmtPct(kpi.carryingCostPct ?? 0)}
                  sub={fmtIls(kpi.carryingCostValue ?? 0)} color="text-orange-400" icon={Zap} />
                <KPICard label="מלאי דומם" value={fmtPct(kpi.deadStockPct ?? 0)}
                  color={kpi.deadStockPct > 10 ? "text-red-400" : "text-amber-400"}
                  sub={`${fmtIls(kpi.deadStockValue ?? 0)} | ${kpi.deadSkuCount ?? 0} SKU`} icon={AlertTriangle} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="דיוק הזמנות" value={fmtPct(kpi.orderAccuracyRate ?? 0)}
                  color={kpi.orderAccuracyRate >= 98 ? "text-green-400" : "text-amber-400"}
                  sub="Order Accuracy Rate" icon={Target} />
                <KPICard label="Dock-to-Stock" value={kpi.dockToStockDays != null ? `${kpi.dockToStockDays} ימים` : "—"}
                  sub="זמן קבלה → מדף" color="text-cyan-400" icon={Clock} />
                <KPICard label="סה״כ SKUs" value={fmtNum(kpi.totalSku ?? 0)}
                  sub={`${kpi.belowReorder ?? 0} מתחת לנקודת הזמנה`}
                  color="text-blue-400" icon={Package} />
                <KPICard label="שווי מלאי" value={fmtIls(kpi.totalValue ?? 0)}
                  sub={`${kpi.totalTransactions ?? 0} תנועות`} color="text-emerald-400" icon={Layers} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-slate-900/60 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald-400" />מד KPIs</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap justify-around gap-4 py-2">
                      <GaugeWidget label="Fill Rate" value={kpi.fillRate ?? 0} color="#10b981" />
                      <GaugeWidget label="דיוק הזמנות" value={kpi.orderAccuracyRate ?? 0} color="#3b82f6" />
                      <GaugeWidget label="מלאי דומם" value={kpi.deadStockPct ?? 0} max={30} color="#ef4444" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/60 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-400" />תנועת מלאי — טרנד שבועי</CardTitle></CardHeader>
                  <CardContent>
                    {trendLoading ? (
                      <div className="h-[180px] flex items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400" /></div>
                    ) : trends.length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={trends} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                          <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} />
                          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                          <Legend wrapperStyle={{ fontSize: "10px", color: "#94a3b8" }} />
                          <Line type="monotone" dataKey="consumed" name="צריכה" stroke="#10b981" dot={false} strokeWidth={2} />
                          <Line type="monotone" dataKey="received" name="קבלות" stroke="#3b82f6" dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">אין נתוני תנועה</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {zones.length > 0 && (
                <Card className="bg-slate-900/60 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-purple-400" />ניצול שטח לפי אזור</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={zones.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                          <YAxis dataKey="zone" type="category" tick={{ fill: "#94a3b8", fontSize: 9 }} width={60} />
                          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                            formatter={(v: unknown) => [fmtIls(Number(v)), "שווי"]} />
                          <Bar dataKey="totalValue" name="שווי מלאי" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 max-h-[220px] overflow-y-auto">
                        {zones.map((z, i) => (
                          <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/30">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-300 truncate max-w-[120px]">{z.zone}</span>
                                <span className="text-foreground font-medium shrink-0">{z.avgFillPct}% מלאי</span>
                              </div>
                              <div className="mt-1 h-1.5 bg-slate-700 rounded-full">
                                <div className="h-full rounded-full transition-all" style={{ width: `${z.avgFillPct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{z.skuCount} SKU | {fmtIls(z.totalValue)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "forecast" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-300">פריטים מובילים:</label>
              <select value={forecastLimit} onChange={e => setForecastLimit(parseInt(e.target.value))}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-foreground">
                {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <Button onClick={() => generateForecastMutation.mutate()} disabled={generateForecastMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {generateForecastMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              הרץ תחזית ML
            </Button>
          </div>

          {forecastLoading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>
          ) : forecasts.length === 0 ? (
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="py-16 text-center">
                <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">אין נתוני תחזית. לחץ "הרץ תחזית ML" ליצירת תחזיות.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-slate-900/60 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">ביקוש חזוי — Top פריטים (30 יום)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={forecasts.slice(0, 10).map((f: Record<string, unknown>) => ({ name: String(f.materialNumber || f.materialId || ""), forecast: Number(f.forecastQty) || 0, actual: Number(f.actualQty) || 0 }))} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 8 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                        <Legend wrapperStyle={{ fontSize: "10px", color: "#94a3b8" }} />
                        <Bar dataKey="forecast" name="תחזית" fill="#10b981" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="actual" name="בפועל" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/60 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">חלוקת רמת ביטחון תחזית</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={[
                          { name: "גבוהה (≥70)", value: forecasts.filter((f: Record<string, unknown>) => Number(f.confidenceScore) >= 70).length },
                          { name: "בינונית (40-70)", value: forecasts.filter((f: Record<string, unknown>) => Number(f.confidenceScore) >= 40 && Number(f.confidenceScore) < 70).length },
                          { name: "נמוכה (<40)", value: forecasts.filter((f: Record<string, unknown>) => Number(f.confidenceScore) < 40).length },
                        ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={80} dataKey="value">
                          {["#10b981", "#f59e0b", "#ef4444"].map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                        <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-slate-900/60 border-slate-700/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">תחזית ביקוש — {forecasts.length} פריטים</CardTitle>
                    <Button variant="ghost" size="sm" className="text-slate-400 gap-1"
                      onClick={() => exportCSV(forecasts, "demand-forecasts.csv")}>
                      <Download className="w-3 h-3" />ייצוא
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-800/60">
                        <tr className="text-muted-foreground text-xs">
                          <th className="text-right py-3 px-4">חומר</th>
                          <th className="text-right py-3 px-4">קטגוריה</th>
                          <th className="text-right py-3 px-4">מלאי נוכחי</th>
                          <th className="text-right py-3 px-4">תחזית (30 יום)</th>
                          <th className="text-right py-3 px-4">כיסוי (ימים)</th>
                          <th className="text-right py-3 px-4">שיטה</th>
                          <th className="text-right py-3 px-4">ביטחון</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecasts.map((f: Record<string, unknown>, i: number) => {
                          const conf = Number(f.confidenceScore) || 0;
                          const cover = f.stockCoverDays != null ? Number(f.stockCoverDays) : null;
                          return (
                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                              <td className="py-2 px-4">
                                <p className="text-foreground font-medium text-xs">{String(f.materialName || "—")}</p>
                                <p className="text-muted-foreground text-[10px]">{String(f.materialNumber || "")}</p>
                              </td>
                              <td className="py-2 px-4 text-slate-300 text-xs">{String(f.category || "—")}</td>
                              <td className="py-2 px-4 text-cyan-400 font-mono text-xs">{Number(f.currentStock || 0).toFixed(1)} {String(f.unit || "")}</td>
                              <td className="py-2 px-4 text-emerald-400 font-mono font-medium text-xs">{Number(f.forecastQty || 0).toFixed(1)}</td>
                              <td className="py-2 px-4">
                                {cover != null ? (
                                  <Badge className={`text-[10px] ${cover < 7 ? "bg-red-500/20 text-red-400" : cover < 30 ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}>{cover}י׳</Badge>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2 px-4 text-slate-400 text-[10px]">{String(f.method || "—")}</td>
                              <td className="py-2 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-16 bg-slate-700 rounded-full">
                                    <div className="h-full rounded-full" style={{ width: `${conf}%`, backgroundColor: conf >= 70 ? "#10b981" : conf >= 40 ? "#f59e0b" : "#ef4444" }} />
                                  </div>
                                  <span className="text-xs text-slate-300">{Math.round(conf)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {activeTab === "reorder" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-amber-500/10 border-amber-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">ממתין לאישור</p>
                <p className="text-2xl font-bold text-amber-400">{pendingReorders.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-500/10 border-green-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">אושרו</p>
                <p className="text-2xl font-bold text-green-400">{reorderList.filter((r: Record<string, unknown>) => r.status === "accepted").length}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">נדחו</p>
                <p className="text-2xl font-bold text-slate-400">{reorderList.filter((r: Record<string, unknown>) => r.status === "dismissed").length}</p>
              </CardContent>
            </Card>
          </div>

          {reorderLoading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>
          ) : pendingReorders.length === 0 ? (
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-green-400">אין הצעות הזמנה ממתינות</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  הצעות הזמנה מחדש ({pendingReorders.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">חומר</th>
                        <th className="text-right py-3 px-4">מלאי נוכחי</th>
                        <th className="text-right py-3 px-4">נק׳ הזמנה נוכחית</th>
                        <th className="text-right py-3 px-4">נק׳ הזמנה מוצעת</th>
                        <th className="text-right py-3 px-4">מלאי בטחון</th>
                        <th className="text-right py-3 px-4">EOQ</th>
                        <th className="text-right py-3 px-4">ביטחון</th>
                        <th className="text-center py-3 px-4">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingReorders.map((r: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4">
                            <p className="text-foreground font-medium text-xs">{String(r.material_name || "—")}</p>
                            <p className="text-muted-foreground text-[10px]">{String(r.material_number || "")}</p>
                          </td>
                          <td className="py-2 px-4 text-cyan-400 font-mono text-xs">{Number(r.current_stock || 0).toFixed(1)}</td>
                          <td className="py-2 px-4 text-slate-400 font-mono text-xs">{Number(r.current_reorder_point || 0).toFixed(1)}</td>
                          <td className="py-2 px-4 text-emerald-400 font-mono font-bold text-xs">{Number(r.suggested_reorder_point || 0).toFixed(1)}</td>
                          <td className="py-2 px-4 text-blue-400 font-mono text-xs">{Number(r.suggested_safety_stock || 0).toFixed(1)}</td>
                          <td className="py-2 px-4 text-purple-400 font-mono text-xs">{Number(r.suggested_eoq || 0).toFixed(1)}</td>
                          <td className="py-2 px-4">
                            <Badge className={`text-[10px] ${Number(r.confidence_score) >= 70 ? "bg-green-500/20 text-green-400" : Number(r.confidence_score) >= 40 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                              {Math.round(Number(r.confidence_score) || 0)}%
                            </Badge>
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => reorderActionMutation.mutate({ id: Number(r.id), action: "accept" })}
                                disabled={reorderActionMutation.isPending}
                                className="p-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors" title="אשר">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => reorderActionMutation.mutate({ id: Number(r.id), action: "dismiss" })}
                                disabled={reorderActionMutation.isPending}
                                className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors" title="דחה">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {pendingReorders.length > 0 && (
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">השוואת נקודות הזמנה — נוכחי vs. מוצע</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={pendingReorders.slice(0, 10).map((r: Record<string, unknown>) => ({
                    name: String(r.material_number || r.material_name || "").slice(0, 10),
                    current: Number(r.current_reorder_point) || 0,
                    suggested: Number(r.suggested_reorder_point) || 0,
                  }))} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 8 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                    <Legend wrapperStyle={{ fontSize: "10px", color: "#94a3b8" }} />
                    <Bar dataKey="current" name="נוכחי" fill="#64748b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="suggested" name="מוצע" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "dead-stock" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-300">ללא תנועה מעל:</label>
              <select value={deadStockDays} onChange={e => setDeadStockDays(parseInt(e.target.value))}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-foreground">
                {[30, 60, 90, 120, 180, 270, 365].map(d => <option key={d} value={d}>{d} ימים</option>)}
              </select>
            </div>
            {deadItems.length > 0 && (
              <Button variant="ghost" size="sm" className="text-slate-400 gap-1" onClick={() => exportCSV(deadItems, `dead-stock-${deadStockDays}d.csv`)}>
                <Download className="w-3 h-3" />ייצוא CSV
              </Button>
            )}
          </div>

          {deadItems.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-red-500/10 border-red-500/30">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">פריטי מלאי דומם</p>
                  <p className="text-2xl font-bold text-red-400">{deadItems.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-red-500/10 border-red-500/30">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">שווי מלאי דומם</p>
                  <p className="text-xl font-bold text-red-400">{fmtIls(deadItems.reduce((s, i) => s + Number(i.stockValue || 0), 0))}</p>
                </CardContent>
              </Card>
              <Card className="bg-orange-500/10 border-orange-500/30">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">עלות החזקה שנתית</p>
                  <p className="text-xl font-bold text-orange-400">{fmtIls(deadItems.reduce((s, i) => s + Number(i.carryingCostAnnual || 0), 0))}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {deadLoading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" /></div>
          ) : deadItems.length === 0 ? (
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-green-400">אין מלאי דומם לפי הפרמטרים הנבחרים</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-900/60 border-red-500/20 border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  מלאי דומם — ללא תנועה מעל {deadStockDays} ימים ({deadItems.length} פריטים)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">חומר</th>
                        <th className="text-right py-3 px-4">קטגוריה</th>
                        <th className="text-right py-3 px-4">מיקום</th>
                        <th className="text-right py-3 px-4">כמות</th>
                        <th className="text-right py-3 px-4">עלות יח׳</th>
                        <th className="text-right py-3 px-4">שווי כולל</th>
                        <th className="text-right py-3 px-4">ימי קיפאון</th>
                        <th className="text-right py-3 px-4">עלות החזקה/שנה</th>
                        <th className="text-right py-3 px-4">תנועה אחרונה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deadItems.map((item: Record<string, unknown>, i: number) => {
                        const days = Number(item.daysSinceMovement) || deadStockDays;
                        return (
                          <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="py-2 px-4">
                              <p className="text-foreground font-medium text-xs">{String(item.materialName || "—")}</p>
                              <p className="text-muted-foreground text-[10px]">{String(item.materialNumber || "")}</p>
                            </td>
                            <td className="py-2 px-4 text-slate-300 text-xs">{String(item.category || "—")}</td>
                            <td className="py-2 px-4 text-slate-400 text-xs">{String(item.warehouseLocation || "—")}</td>
                            <td className="py-2 px-4 text-cyan-400 font-mono text-xs">{Number(item.currentStock || 0).toFixed(1)} {String(item.unit || "")}</td>
                            <td className="py-2 px-4 text-slate-300 text-xs">{fmtIls(Number(item.unitCost || 0))}</td>
                            <td className="py-2 px-4 text-red-400 font-bold text-xs">{fmtIls(Number(item.stockValue || 0))}</td>
                            <td className="py-2 px-4">
                              <Badge className={`text-[10px] ${days > 365 ? "bg-red-600/30 text-red-300" : days > 180 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                                {days} יום
                              </Badge>
                            </td>
                            <td className="py-2 px-4 text-orange-400 text-xs">{fmtIls(Number(item.carryingCostAnnual || 0))}</td>
                            <td className="py-2 px-4 text-muted-foreground text-xs">
                              {item.lastMovementDate ? new Date(String(item.lastMovementDate)).toLocaleDateString("he-IL") : "אף פעם"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
