import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend
} from "recharts";
import {
  BarChart3, Plus, Search, Edit2, Trash2, X, Save, AlertTriangle,
  CheckCircle2, TrendingUp, Activity, Gauge, Eye, ChevronDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { WritePermissionGate } from "@/components/permission-gate";
import { useFormValidation, RequiredMark, FormFieldError } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt4 = (v: any) => v != null ? Number(v).toFixed(4) : "—";
const fmt3 = (v: any) => v != null ? Number(v).toFixed(3) : "—";

interface SpcChart {
  id: number;
  process_name: string;
  parameter_name: string;
  chart_type: string;
  ucl?: number;
  lcl?: number;
  cl?: number;
  usl?: number;
  lsl?: number;
  target?: number;
  unit?: string;
  subgroup_size: number;
  chart_status: string;
  notes?: string;
  measurement_count?: number;
  last_measurement_at?: string;
  measurements?: SpcMeasurement[];
  mean?: number;
  stdDev?: number;
  range?: number;
  cp?: number;
  cpk?: number;
  outOfControlCount?: number;
}

interface SpcMeasurement {
  id: number;
  chart_id: number;
  value: number;
  inspector?: string;
  violation_flags?: string[];
  is_out_of_control: boolean;
  notes?: string;
  recorded_at: string;
}

const chartTypeLabels: Record<string, string> = {
  xbar: "X-bar (ממוצעים)",
  r_chart: "R-chart (טווחים)",
  p_chart: "p-chart (חלק פגום)",
  s_chart: "S-chart (סטיות תקן)",
};

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  in_control: { label: "בשליטה", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  out_of_control: { label: "מחוץ לשליטה", color: "bg-red-500/20 text-red-400", icon: AlertTriangle },
  warning: { label: "אזהרה", color: "bg-yellow-500/20 text-yellow-400", icon: TrendingUp },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground", icon: Activity },
};

function CpkIndicator({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const color = value >= 1.67 ? "text-green-400" : value >= 1.33 ? "text-emerald-400" : value >= 1.0 ? "text-yellow-400" : "text-red-400";
  const label = value >= 1.67 ? "מעולה" : value >= 1.33 ? "טוב" : value >= 1.0 ? "מספיק" : "לא מספיק";
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color}`}>{fmt3(value)}</div>
      <div className={`text-xs ${color}`}>{label}</div>
    </div>
  );
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload?.is_out_of_control) {
    return <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />;
  }
  return <circle cx={cx} cy={cy} r={3} fill="#3b82f6" stroke="#fff" strokeWidth={1} />;
};

export default function SpcPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [charts, setCharts] = useState<SpcChart[]>([]);
  const [statsData, setStatsData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedChart, setSelectedChart] = useState<SpcChart | null>(null);
  const [chartDetail, setChartDetail] = useState<SpcChart | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SpcChart | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showMeasForm, setShowMeasForm] = useState(false);
  const [measForm, setMeasForm] = useState<any>({});

  const validation = useFormValidation({
    processName: { required: true, message: "שם תהליך חובה" },
    parameterName: { required: true, message: "שם פרמטר חובה" },
  });

  const load = async () => {
    setLoading(true);
    try {
      const [chartsRes, statsRes] = await Promise.all([
        authFetch(`${API}/spc-charts`),
        authFetch(`${API}/spc-charts/stats`),
      ]);
      if (chartsRes.ok) setCharts(safeArray(await chartsRes.json()));
      if (statsRes.ok) setStatsData((await statsRes.json()) || {});
    } catch {}
    setLoading(false);
  };

  const loadDetail = async (id: number) => {
    try {
      const res = await authFetch(`${API}/spc-charts/${id}?limit=60`);
      if (res.ok) {
        const data = await res.json();
        setChartDetail(data);
      }
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => charts.filter(c =>
    (filterStatus === "all" || c.chart_status === filterStatus) &&
    (!search || [c.process_name, c.parameter_name].some(f => f?.toLowerCase().includes(search.toLowerCase())))
  ), [charts, search, filterStatus]);

  const openCreate = () => {
    setEditing(null);
    setForm({ chartType: "xbar", subgroupSize: 5 });
    validation.clearErrors();
    setShowForm(true);
  };

  const openEdit = (c: SpcChart) => {
    setEditing(c);
    setForm({
      processName: c.process_name, parameterName: c.parameter_name, chartType: c.chart_type,
      ucl: c.ucl, lcl: c.lcl, cl: c.cl, usl: c.usl, lsl: c.lsl, target: c.target,
      unit: c.unit, subgroupSize: c.subgroup_size, notes: c.notes,
    });
    validation.clearErrors();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/spc-charts/${editing.id}` : `${API}/spc-charts`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק תרשים SPC זה?")) {
      await authFetch(`${API}/spc-charts/${id}`, { method: "DELETE" }); load();
    }
  };

  const openChartDetail = async (c: SpcChart) => {
    setSelectedChart(c);
    await loadDetail(c.id);
  };

  const addMeasurement = async () => {
    if (!selectedChart || !measForm.value) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API}/spc-charts/${selectedChart.id}/measurements`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(measForm),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.violations?.length > 0) {
          const msgs = data.violations.map((v: string) =>
            v === "beyond_ucl" ? "מעל גבול UCL" : v === "beyond_lcl" ? "מתחת לגבול LCL" : "מחוץ לגבולות 2σ"
          ).join(", ");
          alert(`⚠️ התרעה: ${msgs}`);
        }
      }
      setMeasForm({});
      setShowMeasForm(false);
      await loadDetail(selectedChart.id);
      load();
    } catch {}
    setSaving(false);
  };

  const chartData = useMemo(() => {
    if (!chartDetail?.measurements) return [];
    return chartDetail.measurements.map((m, i) => ({
      index: i + 1,
      value: Number(m.value),
      recorded_at: m.recorded_at ? new Date(m.recorded_at).toLocaleDateString("he-IL") : "",
      is_out_of_control: m.is_out_of_control,
      inspector: m.inspector,
    }));
  }, [chartDetail]);

  const kpis = [
    { label: "תרשימים פעילים", value: charts.length, icon: BarChart3, color: "text-blue-400" },
    { label: "בשליטה", value: statsData.in_control || 0, icon: CheckCircle2, color: "text-green-400" },
    { label: "מחוץ לשליטה", value: statsData.out_of_control || 0, icon: AlertTriangle, color: "text-red-400" },
    { label: "אזהרה", value: statsData.warning || 0, icon: TrendingUp, color: "text-yellow-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Gauge className="text-blue-400 w-6 h-6" /> בקרת תהליכים סטטיסטית — SPC
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Statistical Process Control · תרשימי X-bar/R/p · גבולות שליטה · Cp/Cpk</p>
        </div>
        <WritePermissionGate module="production">
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> תרשים חדש
          </button>
        </WritePermissionGate>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי תהליך, פרמטר..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תרשימים</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-2xl p-5 animate-pulse">
              <div className="h-4 w-32 bg-muted/30 rounded mb-2" />
              <div className="h-3 w-24 bg-muted/20 rounded mb-4" />
              <div className="h-20 bg-muted/20 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין תרשימי SPC</p>
          <p className="text-sm mt-1">לחץ על "תרשים חדש" להגדרת בקרת תהליך</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(chart => {
            const si = statusMap[chart.chart_status] || statusMap.inactive;
            const StatusIcon = si.icon;
            return (
              <motion.div key={chart.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border/50 rounded-2xl p-5 hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => openChartDetail(chart)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{chart.process_name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{chart.parameter_name}{chart.unit ? ` (${chart.unit})` : ""}</p>
                  </div>
                  <Badge className={`text-[10px] ${si.color}`}>
                    <StatusIcon className="w-3 h-3 inline ml-1" />{si.label}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                  <div className="bg-muted/10 rounded-lg p-2">
                    <div className="text-xs text-muted-foreground">UCL</div>
                    <div className="text-sm font-mono text-red-400">{chart.ucl != null ? Number(chart.ucl).toFixed(2) : "—"}</div>
                  </div>
                  <div className="bg-muted/10 rounded-lg p-2">
                    <div className="text-xs text-muted-foreground">CL</div>
                    <div className="text-sm font-mono text-green-400">{chart.cl != null ? Number(chart.cl).toFixed(2) : "—"}</div>
                  </div>
                  <div className="bg-muted/10 rounded-lg p-2">
                    <div className="text-xs text-muted-foreground">LCL</div>
                    <div className="text-sm font-mono text-blue-400">{chart.lcl != null ? Number(chart.lcl).toFixed(2) : "—"}</div>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{chartTypeLabels[chart.chart_type] || chart.chart_type}</span>
                  <span>{chart.measurement_count || 0} מדידות</span>
                </div>
                <div className="flex gap-1.5 mt-3 pt-3 border-t border-border/30" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openChartDetail(chart)}
                    className="flex-1 text-xs bg-primary/10 text-primary py-1.5 rounded-lg hover:bg-primary/20 text-center">
                    <Eye className="w-3 h-3 inline ml-1" />תרשים
                  </button>
                  <WritePermissionGate module="production">
                    <button onClick={() => openEdit(chart)} className="px-2.5 py-1.5 text-xs bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={async () => { if (await globalConfirm("למחוק תרשים זה?")) remove(chart.id); }}
                      className="px-2.5 py-1.5 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </WritePermissionGate>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ─── Chart Detail Modal ─── */}
      <AnimatePresence>
        {selectedChart && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedChart(null)}>
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{selectedChart.process_name} — {selectedChart.parameter_name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{chartTypeLabels[selectedChart.chart_type]} · {selectedChart.unit || "ללא יחידה"}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <WritePermissionGate module="production">
                    <button onClick={() => setShowMeasForm(true)}
                      className="flex items-center gap-1.5 text-xs bg-primary/20 text-primary px-3 py-2 rounded-lg hover:bg-primary/30">
                      <Plus className="w-3.5 h-3.5" /> הוסף מדידה
                    </button>
                  </WritePermissionGate>
                  <button onClick={() => setSelectedChart(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
                </div>
              </div>

              {chartDetail && (
                <div className="p-5 space-y-5">
                  {/* Capability Indices */}
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                    {[
                      { label: "ממוצע", value: fmt4(chartDetail.mean) },
                      { label: "סטיית תקן", value: fmt4(chartDetail.stdDev) },
                      { label: "טווח", value: fmt4(chartDetail.range) },
                      { label: "מדידות", value: chartDetail.totalMeasurements || 0 },
                    ].map((kpi, i) => (
                      <div key={i} className="bg-muted/10 rounded-xl p-3 text-center col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">{kpi.label}</div>
                        <div className="font-mono text-sm text-foreground">{kpi.value}</div>
                      </div>
                    ))}
                    <div className="bg-muted/10 rounded-xl p-3 text-center col-span-2">
                      <div className="text-xs text-muted-foreground mb-1">Cp</div>
                      <CpkIndicator value={chartDetail.cp} />
                    </div>
                    <div className="bg-muted/10 rounded-xl p-3 text-center col-span-2">
                      <div className="text-xs text-muted-foreground mb-1">Cpk</div>
                      <CpkIndicator value={chartDetail.cpk} />
                    </div>
                    {(chartDetail.outOfControlCount || 0) > 0 && (
                      <div className="col-span-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-red-400">{chartDetail.outOfControlCount} נקודות מחוץ לשליטה</p>
                          <p className="text-xs text-muted-foreground">בדוק את הנקודות האדומות בתרשים</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Control Chart */}
                  {chartData.length > 0 ? (
                    <div className="bg-muted/5 rounded-2xl p-4 border border-border/30">
                      <h3 className="text-sm font-semibold text-foreground mb-4">
                        תרשים בקרה — {chartTypeLabels[selectedChart.chart_type]}
                      </h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="index" tick={{ fontSize: 10, fill: "#888" }} />
                          <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                          <Tooltip
                            contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }}
                            labelStyle={{ color: "#888" }}
                            formatter={(val: any, name: string) => [Number(val).toFixed(4), name === "value" ? "ערך" : name]}
                          />
                          {chartDetail.ucl != null && (
                            <ReferenceLine y={Number(chartDetail.ucl)} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `UCL: ${Number(chartDetail.ucl).toFixed(2)}`, position: "right", fontSize: 10, fill: "#ef4444" }} />
                          )}
                          {chartDetail.cl != null && (
                            <ReferenceLine y={Number(chartDetail.cl)} stroke="#22c55e" strokeWidth={2} label={{ value: `CL: ${Number(chartDetail.cl).toFixed(2)}`, position: "right", fontSize: 10, fill: "#22c55e" }} />
                          )}
                          {chartDetail.lcl != null && (
                            <ReferenceLine y={Number(chartDetail.lcl)} stroke="#3b82f6" strokeDasharray="6 3" label={{ value: `LCL: ${Number(chartDetail.lcl).toFixed(2)}`, position: "right", fontSize: 10, fill: "#3b82f6" }} />
                          )}
                          {chartDetail.usl != null && (
                            <ReferenceLine y={Number(chartDetail.usl)} stroke="#f97316" strokeDasharray="4 4" label={{ value: `USL: ${Number(chartDetail.usl).toFixed(2)}`, position: "insideRight", fontSize: 9, fill: "#f97316" }} />
                          )}
                          {chartDetail.lsl != null && (
                            <ReferenceLine y={Number(chartDetail.lsl)} stroke="#f97316" strokeDasharray="4 4" label={{ value: `LSL: ${Number(chartDetail.lsl).toFixed(2)}`, position: "insideRight", fontSize: 9, fill: "#f97316" }} />
                          )}
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#3b82f6"
                            strokeWidth={1.5}
                            dot={<CustomDot />}
                            activeDot={{ r: 6 }}
                            name="ערך"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className="flex gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> UCL</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block" /> CL (קו מרכז)</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block" /> LCL</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> מחוץ לשליטה</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground bg-muted/5 rounded-2xl border border-border/30">
                      <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>אין מדידות עדיין</p>
                      <p className="text-xs mt-1">לחץ "הוסף מדידה" לרישום הנתון הראשון</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Add Measurement Modal ─── */}
      <AnimatePresence>
        {showMeasForm && selectedChart && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowMeasForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">הוספת מדידה</h2>
                <button onClick={() => setShowMeasForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">ערך מדוד *</label>
                  <input type="number" step="any" value={measForm.value || ""} onChange={e => setMeasForm({ ...measForm, value: e.target.value })}
                    placeholder={`ערך ב-${selectedChart.unit || "יחידות"}`}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם בודק</label>
                  <input value={measForm.inspector || ""} onChange={e => setMeasForm({ ...measForm, inspector: e.target.value })}
                    placeholder="שם הבודק"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <input value={measForm.notes || ""} onChange={e => setMeasForm({ ...measForm, notes: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                {selectedChart.cl != null && selectedChart.ucl != null && measForm.value && (
                  <div className={`p-3 rounded-xl text-sm ${Number(measForm.value) > Number(selectedChart.ucl) || (selectedChart.lcl != null && Number(measForm.value) < Number(selectedChart.lcl)) ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-green-500/10 text-green-400 border border-green-500/20"}`}>
                    {Number(measForm.value) > Number(selectedChart.ucl)
                      ? "⚠️ ערך גבוה מ-UCL — מחוץ לשליטה!"
                      : selectedChart.lcl != null && Number(measForm.value) < Number(selectedChart.lcl)
                      ? "⚠️ ערך נמוך מ-LCL — מחוץ לשליטה!"
                      : "✓ ערך בתוך גבולות השליטה"}
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowMeasForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={addMeasurement} disabled={saving || !measForm.value}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Chart Form Modal ─── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תרשים SPC" : "תרשים SPC חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />שם תהליך</label>
                  <input value={form.processName || ""} onChange={e => setForm({ ...form, processName: e.target.value })}
                    placeholder="לדוג: קו ריתוך / מחלקת הרכבה"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={validation.errors.processName} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />שם פרמטר</label>
                  <input value={form.parameterName || ""} onChange={e => setForm({ ...form, parameterName: e.target.value })}
                    placeholder="לדוג: קוטר חלק / עובי ציפוי"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                  <FormFieldError error={validation.errors.parameterName} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג תרשים</label>
                  <select value={form.chartType || "xbar"} onChange={e => setForm({ ...form, chartType: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(chartTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">יחידות מדידה</label>
                  <input value={form.unit || ""} onChange={e => setForm({ ...form, unit: e.target.value })}
                    placeholder="mm, kg, %, °C..."
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">UCL (גבול עליון שליטה)</label>
                  <input type="number" step="any" value={form.ucl || ""} onChange={e => setForm({ ...form, ucl: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">LCL (גבול תחתון שליטה)</label>
                  <input type="number" step="any" value={form.lcl || ""} onChange={e => setForm({ ...form, lcl: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">CL (קו מרכזי)</label>
                  <input type="number" step="any" value={form.cl || ""} onChange={e => setForm({ ...form, cl: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">ערך יעד</label>
                  <input type="number" step="any" value={form.target || ""} onChange={e => setForm({ ...form, target: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">USL (מפרט עליון)</label>
                  <input type="number" step="any" value={form.usl || ""} onChange={e => setForm({ ...form, usl: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">LSL (מפרט תחתון)</label>
                  <input type="number" step="any" value={form.lsl || ""} onChange={e => setForm({ ...form, lsl: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">גודל תת-קבוצה</label>
                  <input type="number" value={form.subgroupSize || 5} onChange={e => setForm({ ...form, subgroupSize: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
