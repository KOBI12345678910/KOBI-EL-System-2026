import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ComposedChart, Cell, PieChart, Pie,
  RadialBarChart, RadialBar, ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Package, Factory, Users,
  AlertTriangle, ArrowUpRight, ArrowDownRight, ShieldAlert, Target,
  Zap, Clock, CheckCircle2, XCircle, BarChart3, Activity, Wallet,
  Boxes, Gauge, ArrowUp, ArrowDown,
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = import.meta.env.VITE_API_URL || "";

const MONTHS_HE: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרץ", "04": "אפר", "05": "מאי", "06": "יוני",
  "07": "יולי", "08": "אוג", "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};

const fmtMonth = (m: string) => {
  if (!m) return "";
  const parts = m.split("-");
  return MONTHS_HE[parts[1]] ? `${MONTHS_HE[parts[1]]} ${parts[0]?.slice(2)}` : m;
};

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v / 100);
const fmtK = (v: number) => {
  const abs = Math.abs(v / 100);
  if (abs >= 1_000_000) return `${v < 0 ? "-" : ""}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${v < 0 ? "-" : ""}${(abs / 1_000).toFixed(0)}K`;
  return fmt(v);
};

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

type TabId = "sales" | "cashflow" | "inventory" | "production" | "risk";

const TABS: { id: TabId; label: string; icon: any; color: string }[] = [
  { id: "sales", label: "תחזית מכירות", icon: TrendingUp, color: "text-emerald-400" },
  { id: "cashflow", label: "תזרים מזומנים", icon: Wallet, color: "text-blue-400" },
  { id: "inventory", label: "אופטימיזציית מלאי", icon: Boxes, color: "text-amber-400" },
  { id: "production", label: "יעילות ייצור", icon: Factory, color: "text-purple-400" },
  { id: "risk", label: "סיכון לקוחות", icon: ShieldAlert, color: "text-red-400" },
];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-right" dir="rtl">
      <p className="text-sm font-medium text-foreground mb-2">{fmtMonth(label) || label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="font-mono text-foreground">{typeof entry.value === "number" ? fmtK(entry.value) : entry.value}</span>
        </div>
      ))}
    </div>
  );
};

function KpiCard({ icon: Icon, label, value, change, color, subtitle }: {
  icon: any; label: string; value: string; change?: number; color: string; subtitle?: string;
}) {
  return (
    <div className={`bg-card border border-border/50 rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`h-5 w-5 ${color}`} />
        {change !== undefined && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${change >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
            {change >= 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
            {pct(change)}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold font-mono mt-1 ${color}`}>{value}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function AttentionTable({ items }: { items: { label: string; value: string; severity: string }[] }) {
  if (!items || items.length === 0) return null;
  const sevColors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-300 border-red-500/30",
    warning: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  };
  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
      <div className="p-3 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          פריטים הדורשים תשומת לב ({items.length})
        </h3>
      </div>
      <table className="w-full text-sm" dir="rtl">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-right p-2.5 text-xs text-muted-foreground font-medium">נושא</th>
            <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">ערך</th>
            <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">חומרה</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-border/20">
              <td className="p-2.5 text-foreground font-medium">{item.label}</td>
              <td className="p-2.5 text-center font-mono text-foreground">{item.value}</td>
              <td className="p-2.5 text-center">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sevColors[item.severity] || sevColors.info}`}>
                  {item.severity === "critical" ? "קריטי" : item.severity === "warning" ? "אזהרה" : "מידע"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SalesForecastTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-sales-forecast"],
    queryFn: async () => {
      const r = await authFetch(`${API}/analytics/sales-forecast`);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 120000,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data || Object.keys(data).length === 0) return <div className="p-8 text-center text-muted-foreground">אין נתונים זמינים לתחזוקת מכירות</div>;

  const chartData = [
    ...(data.historical || []).map((h: any) => ({
      month: h.month,
      revenue: Number(h.revenue),
      type: "actual",
    })),
    ...(data.forecast || []).map((f: any) => ({
      month: f.month,
      forecast: f.predicted,
      upper: f.upper,
      lower: f.lower,
      type: "forecast",
    })),
  ];

  const kpis = data.kpis || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={DollarSign} label="הכנסות החודש" value={fmtK(kpis.currentMonthRevenue || 0)} change={kpis.growthRate} color="text-emerald-400" />
        <KpiCard icon={TrendingUp} label="ממוצע חודשי" value={fmtK(kpis.avgMonthlyRevenue || 0)} color="text-blue-400" />
        <KpiCard icon={Target} label="תחזית 3 חודשים" value={fmtK(kpis.forecastNext3 || 0)} color="text-purple-400" />
        <KpiCard icon={BarChart3} label="הצעות מחיר פתוחות" value={String(kpis.pendingQuotes || 0)} color="text-amber-400" subtitle={`צבר: ${fmtK(kpis.quotePipeline || 0)}`} />
        <KpiCard icon={Activity} label="צמיחה" value={pct(kpis.growthRate || 0)} color={kpis.growthRate >= 0 ? "text-emerald-400" : "text-red-400"} />
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          הכנסות היסטוריות + תחזית (ממוצע נע משוקלל)
        </h3>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={fmtMonth} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={fmtK} width={70} />
              <Tooltip content={<ChartTooltip />} />
              <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
              <Area type="monotone" dataKey="upper" name="גבול עליון" stroke="none" fill="url(#fcGrad)" />
              <Area type="monotone" dataKey="lower" name="גבול תחתון" stroke="none" fill="transparent" />
              <Bar dataKey="revenue" name="הכנסות בפועל" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Line type="monotone" dataKey="forecast" name="תחזית" stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="6 3" dot={{ fill: "#8b5cf6", r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <AttentionTable items={data.attentionItems || []} />
    </div>
  );
}

function CashflowTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-cashflow"],
    queryFn: async () => {
      const r = await authFetch(`${API}/analytics/cashflow-prediction`);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 120000,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data || Object.keys(data).length === 0) return <div className="p-8 text-center text-muted-foreground">אין נתונים זמינים לזרימת מזומנים</div>;

  const historical = (data.historical || []).map((h: any) => ({
    month: h.month,
    inflow: h.inflow,
    outflow: -Math.abs(h.outflow),
    net: h.net,
  }));

  const forecastData = (data.forecast || []).map((f: any) => ({
    month: f.month,
    projected: f.projected,
    isForecast: true,
  }));

  const kpis = data.kpis || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Wallet} label="תזרים נטו נוכחי" value={fmtK(kpis.currentNetCashflow || 0)} color={kpis.currentNetCashflow >= 0 ? "text-emerald-400" : "text-red-400"} />
        <KpiCard icon={TrendingUp} label="ממוצע חודשי נטו" value={fmtK(kpis.avgMonthlyNet || 0)} color="text-blue-400" />
        <KpiCard icon={ArrowUp} label="חייבים (AR)" value={fmtK(kpis.totalOutstandingAR || 0)} color="text-emerald-400" />
        <KpiCard icon={ArrowDown} label="זכאים (AP)" value={fmtK(kpis.totalOutstandingAP || 0)} color="text-red-400" />
        <KpiCard icon={Activity} label="שיעור גבייה" value={`${kpis.collectionRate || 0}%`} color="text-cyan-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            תזרים מזומנים — היסטורי
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historical} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={fmtMonth} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={fmtK} width={70} />
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                <Bar dataKey="inflow" name="כניסות" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="outflow" name="יציאות" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            תזרים נטו + תחזית
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={[
                  ...historical.map((h: any) => ({ month: h.month, net: h.net })),
                  ...forecastData.map((f: any) => ({ month: f.month, projected: f.projected })),
                ]}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="netGradAn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={fmtMonth} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={fmtK} width={70} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="net" name="נטו בפועל" stroke="#3b82f6" fill="url(#netGradAn)" strokeWidth={2} />
                <Area type="monotone" dataKey="projected" name="תחזית" stroke="#8b5cf6" fill="url(#projGrad)" strokeWidth={2} strokeDasharray="6 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <AttentionTable items={data.attentionItems || []} />

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">מצב נטו AR vs AP</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
            <p className="text-[11px] text-muted-foreground">חייבים (AR)</p>
            <p className="text-lg font-bold font-mono text-emerald-400">{fmtK(kpis.totalOutstandingAR || 0)}</p>
          </div>
          <div className="text-2xl font-bold text-muted-foreground">-</div>
          <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
            <p className="text-[11px] text-muted-foreground">זכאים (AP)</p>
            <p className="text-lg font-bold font-mono text-red-400">{fmtK(kpis.totalOutstandingAP || 0)}</p>
          </div>
          <div className="text-2xl font-bold text-muted-foreground">=</div>
          <div className={`flex-1 ${(kpis.netPosition || 0) >= 0 ? "bg-blue-500/10 border-blue-500/20" : "bg-amber-500/10 border-amber-500/20"} border rounded-lg p-3 text-center`}>
            <p className="text-[11px] text-muted-foreground">פוזיציה נטו</p>
            <p className={`text-lg font-bold font-mono ${(kpis.netPosition || 0) >= 0 ? "text-blue-400" : "text-amber-400"}`}>{fmtK(kpis.netPosition || 0)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-inventory"],
    queryFn: async () => {
      const r = await authFetch(`${API}/analytics/inventory-optimization`);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 120000,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data || Object.keys(data).length === 0) return <div className="p-8 text-center text-muted-foreground">אין נתונים זמינים לאופטימיזציית מלאי</div>;

  const kpis = data.kpis || {};
  const items = data.items || [];
  const catBreakdown = data.categoryBreakdown || [];

  const statusColors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-300 border-red-500/30",
    low: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    excess: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    optimal: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  };
  const statusLabels: Record<string, string> = {
    critical: "קריטי", low: "נמוך", excess: "עודף", optimal: "תקין",
  };

  const pieData = [
    { name: "קריטי", value: kpis.critical, color: "#ef4444" },
    { name: "נמוך", value: kpis.low, color: "#f59e0b" },
    { name: "עודף", value: kpis.excess, color: "#3b82f6" },
    { name: "תקין", value: kpis.optimal, color: "#10b981" },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Boxes} label="סה״כ פריטים" value={String(kpis.totalItems || 0)} color="text-blue-400" />
        <KpiCard icon={AlertTriangle} label="מלאי קריטי" value={String(kpis.critical || 0)} color="text-red-400" />
        <KpiCard icon={TrendingDown} label="מלאי נמוך" value={String(kpis.low || 0)} color="text-amber-400" />
        <KpiCard icon={ArrowUp} label="עודף מלאי" value={String(kpis.excess || 0)} color="text-blue-400" />
        <KpiCard icon={DollarSign} label="שווי מלאי" value={fmtK(kpis.totalValue || 0)} color="text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">התפלגות סטטוס מלאי</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} strokeWidth={0}>
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", direction: "rtl" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {pieData.map((d, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">פילוח לפי קטגוריה</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catBreakdown} layout="vertical" margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis type="category" dataKey="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={80} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="כמות פריטים" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={20} />
                <Bar dataKey="critical" name="דורשים התייחסות" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            פריטים דורשי תשומת לב ({items.filter((i: any) => i.status !== "optimal").length})
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead className="bg-muted/30 sticky top-0">
              <tr>
                <th className="text-right p-2.5 text-xs text-muted-foreground font-medium">שם</th>
                <th className="text-right p-2.5 text-xs text-muted-foreground font-medium">מק״ט</th>
                <th className="text-right p-2.5 text-xs text-muted-foreground font-medium">קטגוריה</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">מלאי</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">מינימום</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">מילוי</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">סטטוס</th>
                <th className="text-right p-2.5 text-xs text-muted-foreground font-medium">המלצה</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 20).map((item: any, idx: number) => (
                <tr key={idx} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="p-2.5 text-foreground font-medium">{item.name}</td>
                  <td className="p-2.5 text-muted-foreground font-mono text-xs">{item.sku}</td>
                  <td className="p-2.5 text-muted-foreground text-xs">{item.category}</td>
                  <td className="p-2.5 text-center font-mono">{item.current_stock}</td>
                  <td className="p-2.5 text-center font-mono text-muted-foreground">{item.min_stock}</td>
                  <td className="p-2.5 text-center">
                    <div className="w-full bg-muted/30 rounded-full h-1.5 mx-auto max-w-[60px]">
                      <div
                        className={`h-1.5 rounded-full ${item.status === "critical" ? "bg-red-500" : item.status === "low" ? "bg-amber-500" : item.status === "excess" ? "bg-blue-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, item.fill_rate)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{item.fill_rate}%</span>
                  </td>
                  <td className="p-2.5 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColors[item.status]}`}>
                      {statusLabels[item.status]}
                    </span>
                  </td>
                  <td className="p-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{item.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductionTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-production"],
    queryFn: async () => {
      const r = await authFetch(`${API}/analytics/production-efficiency`);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 120000,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data || Object.keys(data).length === 0) return <div className="p-8 text-center text-muted-foreground">אין נתונים זמינים ליעילות הייצור</div>;

  const kpis = data.kpis || {};
  const oee = data.oee || {};
  const weekly = data.weekly || [];
  const bottlenecks = data.bottlenecks || [];

  const oeeRadial = [
    { name: "OEE", value: oee.overall, fill: "#10b981" },
    { name: "זמינות", value: oee.availability, fill: "#3b82f6" },
    { name: "ביצועים", value: oee.performance, fill: "#8b5cf6" },
    { name: "איכות", value: oee.quality, fill: "#f59e0b" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Gauge} label="OEE כולל" value={`${oee.overall || 0}%`} color="text-emerald-400" />
        <KpiCard icon={CheckCircle2} label="שיעור השלמה" value={`${kpis.completionRate || 0}%`} change={kpis.completionRateChange} color="text-blue-400" />
        <KpiCard icon={Clock} label="זמן ממוצע (שעות)" value={String(kpis.avgLeadTime || 0)} color="text-amber-400" />
        <KpiCard icon={Factory} label="הזמנות השבוע" value={String(kpis.totalThisWeek || 0)} color="text-purple-400" />
        <KpiCard icon={Zap} label="הושלמו" value={String(kpis.completedThisWeek || 0)} color="text-cyan-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-400" />
            OEE — מדד יעילות כוללת
          </h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="25%" outerRadius="95%" barSize={14} data={oeeRadial} startAngle={90} endAngle={-270}>
                <RadialBar background={{ fill: "hsl(var(--muted))", opacity: 0.15 }} dataKey="value" cornerRadius={7} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", direction: "rtl" }} formatter={(v: number) => `${v}%`} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {oeeRadial.map((d, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                {d.name}: {d.value}%
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            מגמת ייצור שבועית
          </h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weekly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="week" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickFormatter={(w) => w?.slice(5)} />
                <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="left" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                <Bar yAxisId="left" dataKey="completed" name="הושלמו" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar yAxisId="left" dataKey="inProgress" name="בתהליך" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar yAxisId="left" dataKey="rejected" name="נדחו" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line yAxisId="right" type="monotone" dataKey="leadTime" name="זמן אספקה (שעות)" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          זיהוי צווארי בקבוק
        </h3>
        <div className="space-y-2.5">
          {bottlenecks.map((b: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm text-foreground min-w-[140px] font-medium">{b.station}</span>
              <div className="flex-1">
                <div className="w-full bg-muted/20 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      b.utilization >= 90 ? "bg-red-500" : b.utilization >= 80 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${b.utilization}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-mono text-foreground min-w-[40px] text-left">{b.utilization}%</span>
              <span className="text-[10px] text-muted-foreground min-w-[55px]">{b.waitTime} דקות</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                b.status === "bottleneck" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                b.status === "high" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                b.status === "low" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              }`}>
                {b.status === "bottleneck" ? "צוואר בקבוק" : b.status === "high" ? "עומס" : b.status === "low" ? "תפוסה נמוכה" : "תקין"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <AttentionTable items={data.attentionItems || []} />
    </div>
  );
}

function CustomerRiskTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-customer-risk"],
    queryFn: async () => {
      const r = await authFetch(`${API}/analytics/customer-risk`);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 120000,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data || Object.keys(data).length === 0) return <div className="p-8 text-center text-muted-foreground">אין נתונים זמינים לניתוח סיכון לקוחות</div>;

  const kpis = data.kpis || {};
  const customers = data.customers || [];
  const dist = data.distribution || {};

  const riskColors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-300 border-red-500/30",
    high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    low: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  };
  const riskLabels: Record<string, string> = {
    critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך",
  };

  const distPie = [
    { name: "קריטי", value: dist.critical || 0, color: "#ef4444" },
    { name: "גבוה", value: dist.high || 0, color: "#f97316" },
    { name: "בינוני", value: dist.medium || 0, color: "#f59e0b" },
    { name: "נמוך", value: dist.low || 0, color: "#10b981" },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Users} label="סה״כ לקוחות" value={String(kpis.totalCustomers || 0)} color="text-blue-400" />
        <KpiCard icon={ShieldAlert} label="בסיכון" value={String(kpis.atRiskCount || 0)} color="text-red-400" />
        <KpiCard icon={DollarSign} label="חשיפה כספית" value={fmtK(kpis.totalAtRiskBalance || 0)} color="text-amber-400" />
        <KpiCard icon={Target} label="ציון סיכון ממוצע" value={String(kpis.avgRiskScore || 0)} color="text-purple-400" />
        <KpiCard icon={Clock} label="ממוצע ימי תשלום" value={`${kpis.avgDaysToPay || 0} ימים`} color="text-cyan-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">התפלגות סיכון</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                  {distPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", direction: "rtl" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1">
            {distPie.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </span>
                <span className="font-mono text-foreground">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">מפת סיכון — ציון מול חשיפה כספית</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="riskScore" type="number" domain={[0, 100]} name="ציון סיכון" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} label={{ value: "ציון סיכון", position: "insideBottom", offset: -5, style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 } }} />
                <YAxis dataKey="balance" type="number" name="חשיפה כספית" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={fmtK} />
                <ZAxis dataKey="avgDaysToPay" range={[40, 300]} name="ימי תשלום" />
                <Tooltip content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  return (
                    <div className="bg-card border border-border rounded-lg p-2 text-[11px] text-foreground shadow-lg" dir="rtl">
                      <div className="font-bold mb-1">{d.name}</div>
                      <div>ציון סיכון: {d.riskScore}</div>
                      <div>חשיפה: {fmt(d.balance)}</div>
                      <div>ימי תשלום: {d.avgDaysToPay}</div>
                      <div>מגמת הזמנות: {d.orderTrend}%</div>
                    </div>
                  );
                }} />
                <Scatter data={customers} name="לקוחות">
                  {customers.map((c: { riskLevel: string }, i: number) => (
                    <Cell key={i} fill={c.riskLevel === "critical" ? "#ef4444" : c.riskLevel === "high" ? "#f97316" : c.riskLevel === "medium" ? "#f59e0b" : "#10b981"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <AttentionTable items={data.attentionItems || []} />

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border/30">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            דירוג סיכון לקוחות
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead className="bg-muted/30 sticky top-0">
              <tr>
                <th className="text-right p-2.5 text-xs text-muted-foreground font-medium">לקוח</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">ציון</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">רמה</th>
                <th className="text-right p-2.5 text-xs text-muted-foreground font-medium">יתרת חוב</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">ניצול אשראי</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">חשבוניות</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">באיחור</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">ביטולים</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">מגמת הזמנות</th>
                <th className="text-center p-2.5 text-xs text-muted-foreground font-medium">ימי תשלום</th>
                <th className="text-right p-2.5 text-xs text-muted-foreground font-medium">גורמי סיכון</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c: { name: string; riskScore: number; riskLevel: string; balance: number; creditUtilization: number; totalInvoices: number; overdueInvoices: number; cancelledInvoices: number; orderTrend: number; avgDaysToPay: number; factors: string[] }, idx: number) => (
                <tr key={idx} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="p-2.5 text-foreground font-medium">{c.name}</td>
                  <td className="p-2.5 text-center">
                    <div className="inline-flex items-center gap-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{
                        background: `conic-gradient(${c.riskScore >= 70 ? "#ef4444" : c.riskScore >= 50 ? "#f97316" : c.riskScore >= 30 ? "#f59e0b" : "#10b981"} ${c.riskScore}%, transparent 0)`,
                      }}>
                        <span className="bg-card rounded-full w-6 h-6 flex items-center justify-center text-[10px] text-foreground">{c.riskScore}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-2.5 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${riskColors[c.riskLevel]}`}>
                      {riskLabels[c.riskLevel]}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-mono text-xs">{fmtK(c.balance)}</td>
                  <td className="p-2.5 text-center">
                    <div className="w-full bg-muted/20 rounded-full h-1.5 max-w-[60px] mx-auto">
                      <div
                        className={`h-1.5 rounded-full ${c.creditUtilization >= 80 ? "bg-red-500" : c.creditUtilization >= 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, c.creditUtilization)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{c.creditUtilization}%</span>
                  </td>
                  <td className="p-2.5 text-center font-mono text-xs">{c.totalInvoices}</td>
                  <td className="p-2.5 text-center font-mono text-xs">
                    {c.overdueInvoices > 0 ? <span className="text-red-400">{c.overdueInvoices}</span> : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="p-2.5 text-center font-mono text-xs">
                    {c.cancelledInvoices > 0 ? <span className="text-orange-400">{c.cancelledInvoices}</span> : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="p-2.5 text-center font-mono text-xs">
                    <span className={c.orderTrend < -20 ? "text-red-400" : c.orderTrend < 0 ? "text-amber-400" : "text-emerald-400"}>
                      {c.orderTrend > 0 ? "+" : ""}{c.orderTrend}%
                    </span>
                  </td>
                  <td className="p-2.5 text-center font-mono text-xs">
                    <span className={c.avgDaysToPay > 60 ? "text-red-400" : c.avgDaysToPay > 45 ? "text-amber-400" : "text-foreground"}>
                      {c.avgDaysToPay}
                    </span>
                  </td>
                  <td className="p-2.5 text-right">
                    <div className="flex flex-wrap gap-1">
                      {(c.factors || []).map((f: string, fi: number) => (
                        <span key={fi} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">{f}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
            <div className="h-5 w-5 rounded bg-muted/20" />
            <div className="h-3 w-2/3 rounded bg-muted/15" />
            <div className="h-6 w-1/2 rounded bg-muted/20" />
          </div>
        ))}
      </div>
      <div className="bg-card border border-border/50 rounded-xl p-4">
        <div className="h-4 w-48 rounded bg-muted/20 mb-4" />
        <div className="h-[300px] rounded bg-muted/10" />
      </div>
    </div>
  );
}

export default function AnalyticsEnginePage() {
  const [activeTab, setActiveTab] = useState<TabId>("sales");

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-primary" />
            מנוע אנליטיקה מתקדם
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">תחזיות, אופטימיזציה ומודיעין עסקי — Predictive Intelligence</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border/30">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? `bg-card border border-b-0 border-border/50 ${tab.color}`
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[400px]">
        {activeTab === "sales" && <SalesForecastTab />}
        {activeTab === "cashflow" && <CashflowTab />}
        {activeTab === "inventory" && <InventoryTab />}
        {activeTab === "production" && <ProductionTab />}
        {activeTab === "risk" && <CustomerRiskTab />}
      </div>
    </div>
  );
}
