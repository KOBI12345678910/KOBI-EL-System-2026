import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  Shield, TrendingUp, TrendingDown, Minus, AlertTriangle, AlertCircle, Info,
  DollarSign, Factory, Users, ShoppingCart, Truck, CheckCircle, BarChart3,
  Activity, Zap, Target, Briefcase, PieChart, RefreshCw, Clock,
  ArrowUpRight, ArrowDownRight, Building2, Gauge
} from "lucide-react";

interface WarRoomData {
  timestamp: string;
  healthScore: {
    overall: number;
    financial: number;
    production: number;
    sales: number;
    hr: number;
    quality: number;
    status: string;
  };
  financial: {
    totalRevenue: number;
    totalExpenses: number;
    grossProfit: number;
    profitMargin: number;
    cashBalance: number;
    totalAR: number;
    overdueAR: number;
    totalProcurement: number;
    budgetAllocated: number;
    budgetUsed: number;
    budgetUtilization: number;
  };
  production: {
    totalWorkOrders: number;
    completed: number;
    inProgress: number;
    planned: number;
    efficiency: number;
    qcPassRate: number;
    qcTotal: number;
  };
  sales: {
    totalOrders: number;
    activeOrders: number;
    totalCustomers: number;
    activeCustomers: number;
    totalLeads: number;
    hotLeads: number;
    pipelineValue: number;
    conversionRate: number;
  };
  procurement: {
    totalPOs: number;
    totalValue: number;
    byStatus: Record<string, { count: number; total: number }>;
  };
  hr: {
    totalEmployees: number;
    activeEmployees: number;
    attendanceRate: number;
  };
  projects: {
    active: number;
    total: number;
    totalBudget: number;
  };
  alerts: Array<{
    id: string;
    severity: string;
    module: string;
    title: string;
    description: string;
    timestamp: string;
  }>;
  kpiGrid: Array<{
    key: string;
    label: string;
    value: number;
    format: string;
    trend: string;
  }>;
}

function formatCurrency(v: number) {
  if (Math.abs(v) >= 1000000) return `₪${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `₪${(v / 1000).toFixed(0)}K`;
  return `₪${v.toLocaleString()}`;
}

function formatValue(v: number, format: string) {
  if (format === "currency") return formatCurrency(v);
  if (format === "percent") return `${v}%`;
  return v.toLocaleString();
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <ArrowUpRight className="w-3 h-3 text-emerald-400" />;
  if (trend === "down") return <ArrowDownRight className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function HealthGauge({ score, label, size = "lg" }: { score: number; label: string; size?: string }) {
  const color = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-yellow-400" : score >= 40 ? "text-orange-400" : "text-red-400";
  const bgColor = score >= 80 ? "from-emerald-500/20" : score >= 60 ? "from-yellow-500/20" : score >= 40 ? "from-orange-500/20" : "from-red-500/20";
  const radius = size === "lg" ? 54 : 30;
  const stroke = size === "lg" ? 8 : 5;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width={size === "lg" ? 130 : 74} height={size === "lg" ? 130 : 74} className="transform -rotate-90">
          <circle cx={size === "lg" ? 65 : 37} cy={size === "lg" ? 65 : 37} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
          <circle cx={size === "lg" ? 65 : 37} cy={size === "lg" ? 65 : 37} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            className={`${color} transition-all duration-1000`} />
        </svg>
        <div className={`absolute inset-0 flex items-center justify-center ${color}`}>
          <span className={size === "lg" ? "text-3xl font-bold" : "text-lg font-bold"}>{score}</span>
        </div>
      </div>
      <span className={`text-muted-foreground ${size === "lg" ? "text-sm" : "text-xs"}`}>{label}</span>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <AlertCircle className="w-4 h-4 text-red-400" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  return <Info className="w-4 h-4 text-blue-400" />;
}

export default function WarRoomPage() {
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const { data, isLoading: loading } = useQuery<WarRoomData | null>({
    queryKey: ["war-room"],
    queryFn: async () => {
      const res = await authFetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/executive/war-room`);
      if (!res.ok) return null;
      setLastRefresh(new Date());
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-muted-foreground">טוען חדר מלחמה...</p>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-center text-muted-foreground py-20" dir="rtl">שגיאה בטעינת נתונים</div>;

  const { healthScore, financial, production, sales, procurement, hr, projects, alerts, kpiGrid } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-red-600 to-orange-600 rounded-xl">
            <Shield className="w-7 h-7 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">חדר מלחמה — מרכז שליטה</h1>
            <p className="text-muted-foreground text-sm">TECHNO-KOL UZI — Executive War Room</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            עדכון: {lastRefresh.toLocaleTimeString("he-IL")}
          </span>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ["war-room"] })} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3 bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700/50 p-5">
          <div className="text-center mb-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">בריאות החברה</h3>
            <HealthGauge score={healthScore.overall} label={healthScore.status === "excellent" ? "מצוין" : healthScore.status === "good" ? "טוב" : healthScore.status === "warning" ? "זהירות" : "קריטי"} />
          </div>
          <div className="grid grid-cols-5 gap-2 mt-4">
            <HealthGauge score={healthScore.financial} label="פיננסי" size="sm" />
            <HealthGauge score={healthScore.production} label="ייצור" size="sm" />
            <HealthGauge score={healthScore.sales} label="מכירות" size="sm" />
            <HealthGauge score={healthScore.hr} label="HR" size="sm" />
            <HealthGauge score={healthScore.quality} label="איכות" size="sm" />
          </div>
        </div>

        <div className="col-span-12 lg:col-span-9 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: DollarSign, label: "הכנסות", value: formatCurrency(financial.totalRevenue), sub: `רווח: ${financial.profitMargin}%`, color: "from-emerald-600 to-emerald-700", trend: financial.profitMargin > 15 },
            { icon: TrendingDown, label: "הוצאות", value: formatCurrency(financial.totalExpenses), sub: `רכש: ${formatCurrency(financial.totalProcurement)}`, color: "from-red-600 to-red-700", trend: false },
            { icon: Building2, label: "מזומנים", value: formatCurrency(financial.cashBalance), sub: `חייבים: ${formatCurrency(financial.totalAR)}`, color: "from-blue-600 to-blue-700", trend: financial.cashBalance > 100000 },
            { icon: PieChart, label: "רווח גולמי", value: formatCurrency(financial.grossProfit), sub: `מרווח: ${financial.profitMargin}%`, color: "from-purple-600 to-purple-700", trend: financial.grossProfit > 0 },
            { icon: Factory, label: "הזמנות עבודה", value: production.totalWorkOrders.toString(), sub: `בביצוע: ${production.inProgress}`, color: "from-amber-600 to-amber-700", trend: true },
            { icon: Gauge, label: "יעילות ייצור", value: `${production.efficiency}%`, sub: `QC: ${production.qcPassRate}%`, color: "from-cyan-600 to-cyan-700", trend: production.efficiency > 70 },
            { icon: ShoppingCart, label: "הזמנות פעילות", value: sales.activeOrders.toString(), sub: `לקוחות: ${sales.activeCustomers}`, color: "from-indigo-600 to-indigo-700", trend: true },
            { icon: Target, label: "צינור מכירות", value: formatCurrency(sales.pipelineValue), sub: `המרה: ${sales.conversionRate}%`, color: "from-pink-600 to-pink-700", trend: sales.pipelineValue > 0 },
          ].map((card, i) => (
            <div key={i} className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-3 hover:border-slate-600/60 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${card.color}`}>
                  <card.icon className="w-4 h-4 text-foreground" />
                </div>
                {card.trend ? <ArrowUpRight className="w-3 h-3 text-emerald-400" /> : <ArrowDownRight className="w-3 h-3 text-red-400" />}
              </div>
              <p className="text-lg font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Factory className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-medium text-foreground">סטטוס ייצור</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "מתוכנן", count: production.planned, color: "bg-blue-500", pct: production.totalWorkOrders > 0 ? (production.planned / production.totalWorkOrders) * 100 : 0 },
              { label: "בביצוע", count: production.inProgress, color: "bg-amber-500", pct: production.totalWorkOrders > 0 ? (production.inProgress / production.totalWorkOrders) * 100 : 0 },
              { label: "הושלם", count: production.completed, color: "bg-emerald-500", pct: production.totalWorkOrders > 0 ? (production.completed / production.totalWorkOrders) * 100 : 0 },
            ].map((item, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="text-muted-foreground">{item.count} ({item.pct.toFixed(0)}%)</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full ${item.color} rounded-full transition-all duration-700`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700/50 grid grid-cols-2 gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-cyan-400">{production.qcPassRate}%</p>
              <p className="text-xs text-muted-foreground">מעבר QC</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-amber-400">{production.efficiency}%</p>
              <p className="text-xs text-muted-foreground">יעילות</p>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-medium text-foreground">פולס מכירות</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "לקוחות פעילים", value: sales.activeCustomers, icon: Users, color: "text-blue-400" },
              { label: "לידים חמים", value: sales.hotLeads, icon: Zap, color: "text-orange-400" },
              { label: "הזמנות", value: sales.totalOrders, icon: ShoppingCart, color: "text-indigo-400" },
              { label: "המרה", value: `${sales.conversionRate}%`, icon: Target, color: "text-emerald-400" },
            ].map((item, i) => (
              <div key={i} className="bg-slate-900/50 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
                <p className="text-lg font-bold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">צינור מכירות</span>
              <span className="text-sm font-bold text-indigo-400">{formatCurrency(sales.pipelineValue)}</span>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-medium text-foreground">התראות חיות</h3>
            {alerts.length > 0 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">{alerts.length}</span>
            )}
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
            {alerts.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">אין התראות פעילות</p>
                <p className="text-xs text-muted-foreground">המערכת פועלת תקין</p>
              </div>
            ) : alerts.map((alert) => (
              <div key={alert.id} className={`p-2.5 rounded-lg border ${
                alert.severity === "critical" ? "bg-red-500/10 border-red-500/30" :
                alert.severity === "warning" ? "bg-yellow-500/10 border-yellow-500/30" :
                "bg-blue-500/10 border-blue-500/30"
              }`}>
                <div className="flex items-start gap-2">
                  <SeverityIcon severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-5 h-5 text-orange-400" />
            <h3 className="text-sm font-medium text-foreground">רכש ואספקה</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-orange-400">{procurement.totalPOs}</p>
              <p className="text-xs text-muted-foreground">הזמנות רכש</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-foreground">{formatCurrency(procurement.totalValue)}</p>
              <p className="text-xs text-muted-foreground">סה"כ ערך</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-blue-400">{financial.budgetUtilization}%</p>
              <p className="text-xs text-muted-foreground">ניצול תקציב</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 bg-slate-900/30 rounded-lg p-2">
              <Users className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-sm font-bold text-foreground">{hr.totalEmployees}</p>
                <p className="text-xs text-muted-foreground">עובדים</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-900/30 rounded-lg p-2">
              <Briefcase className="w-4 h-4 text-purple-400" />
              <div>
                <p className="text-sm font-bold text-foreground">{projects.active}</p>
                <p className="text-xs text-muted-foreground">פרויקטים פעילים</p>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6 bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-medium text-foreground">לוח KPI חי</h3>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {kpiGrid.map((kpi) => (
              <div key={kpi.key} className="bg-slate-900/50 rounded-lg p-2 text-center hover:bg-slate-900/80 transition-colors">
                <div className="flex items-center justify-center gap-0.5 mb-0.5">
                  <TrendIcon trend={kpi.trend} />
                </div>
                <p className="text-sm font-bold text-foreground truncate">{formatValue(kpi.value, kpi.format)}</p>
                <p className="text-[10px] text-muted-foreground truncate">{kpi.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-medium text-foreground">מפת חום פיננסית</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { label: "הכנסות", value: financial.totalRevenue, color: financial.totalRevenue > 0 ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-slate-700/20 border-slate-700/30 text-muted-foreground" },
            { label: "הוצאות", value: financial.totalExpenses, color: financial.totalExpenses > financial.totalRevenue * 0.8 ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-amber-500/20 border-amber-500/30 text-amber-400" },
            { label: "רווח", value: financial.grossProfit, color: financial.grossProfit > 0 ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-red-500/20 border-red-500/30 text-red-400" },
            { label: "מזומנים", value: financial.cashBalance, color: financial.cashBalance > 500000 ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : financial.cashBalance > 100000 ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" : "bg-red-500/20 border-red-500/30 text-red-400" },
            { label: "חייבים", value: financial.totalAR, color: "bg-purple-500/20 border-purple-500/30 text-purple-400" },
            { label: "באיחור", value: financial.overdueAR, color: financial.overdueAR > 0 ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" },
            { label: "תקציב", value: financial.budgetAllocated, color: "bg-indigo-500/20 border-indigo-500/30 text-indigo-400" },
            { label: "ניצול", value: financial.budgetUsed, color: financial.budgetUtilization > 90 ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" },
          ].map((cell, i) => (
            <div key={i} className={`rounded-lg border p-3 text-center ${cell.color}`}>
              <p className="text-lg font-bold">{formatCurrency(cell.value)}</p>
              <p className="text-xs opacity-70">{cell.label}</p>
            </div>
          ))}
        </div>
      </div>

      <RelatedRecords tabs={[
        { key: "alerts", label: "התראות פעילות", endpoint: "/api/executive/war-room", columns: [{ key: "type", label: "סוג" }, { key: "message", label: "הודעה" }] },
      ]} />

      <ActivityLog entityType="war-room" compact />
    </div>
  );
}
