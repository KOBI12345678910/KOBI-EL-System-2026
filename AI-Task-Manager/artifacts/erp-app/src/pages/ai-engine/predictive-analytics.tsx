import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, AlertTriangle, Calendar, DollarSign, Target,
  BarChart3, Activity, ArrowUp, ArrowDown, Package,
  Brain, ChevronDown, RefreshCw, Minus
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend, ReferenceLine, LineChart, Line
} from "recharts";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const fmtK = (n: number) => n >= 1000000 ? `₪${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `₪${(n / 1000).toFixed(0)}K` : `₪${n}`;

const MONTH_NAMES: Record<string, string> = {
  "01": "ינו׳", "02": "פבר׳", "03": "מרץ", "04": "אפר׳",
  "05": "מאי", "06": "יונ׳", "07": "יול׳", "08": "אוג׳",
  "09": "ספט׳", "10": "אוק׳", "11": "נוב׳", "12": "דצמ׳",
};
function fmtMonth(m: string) {
  const p = m.split("-");
  return `${MONTH_NAMES[p[1]] || p[1]} ${p[0]?.slice(2)}`;
}

interface SalesForecast {
  historical: Array<{ month: string; revenue: number; invoice_count: number }>;
  forecast: Array<{ month: string; predicted: number; upper: number; lower: number }>;
  kpis: {
    currentMonthRevenue: number;
    growthRate: number;
    avgMonthlyRevenue: number;
    pendingQuotes: number;
    quotePipeline: number;
    forecastNext3: number;
  };
  attentionItems: Array<{ label: string; value: string; severity: string }>;
}

interface CashflowData {
  historical: Array<{ month: string; inflow: number; outflow: number; net: number }>;
  forecast: Array<{ month: string; projected: number; isForecast: boolean }>;
  kpis: {
    currentNetCashflow: number;
    avgMonthlyNet: number;
    totalOutstandingAR: number;
    totalOutstandingAP: number;
    netPosition: number;
    collectionRate: number;
  };
  attentionItems: Array<{ label: string; value: string; severity: string }>;
}

interface InventoryData {
  items: Array<{
    name: string;
    current_stock: number;
    min_stock: number;
    max_stock: number;
    stock_value: number;
    status: string;
    recommendation: string;
    fill_rate: number;
    category: string;
  }>;
  kpis: { totalItems: number; critical: number; low: number; excess: number; optimal: number; totalValue: number };
  categoryBreakdown: Array<{ category: string; count: number; value: number; critical: number }>;
}

interface CustomerRisk {
  customers: Array<{
    id: number;
    name: string;
    company: string;
    riskScore: number;
    riskLevel: string;
    balance: number;
    creditLimit: number;
    creditUtilization: number;
    avgDaysToPay: number;
    factors: string[];
    orderTrend: number;
  }>;
  distribution: { critical: number; high: number; medium: number; low: number };
  kpis: { totalCustomers: number; atRiskCount: number; totalAtRiskBalance: number; avgRiskScore: number; avgDaysToPay: number };
  attentionItems: Array<{ label: string; value: string; severity: string }>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs" dir="rtl">
      <div className="font-medium mb-1 text-foreground">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}: </span>
          <span className="font-medium">{typeof p.value === "number" ? fmtK(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

type Tab = "forecast" | "cashflow" | "inventory" | "churn";

export default function PredictiveAnalytics() {
  const [tab, setTab] = useState<Tab>("forecast");
  const [salesData, setSalesData] = useState<SalesForecast | null>(null);
  const [cashflowData, setCashflowData] = useState<CashflowData | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [customerRisk, setCustomerRisk] = useState<CustomerRisk | null>(null);
  const [loading, setLoading] = useState<Record<Tab, boolean>>({ forecast: false, cashflow: false, inventory: false, churn: false });
  const [period, setPeriod] = useState<3 | 6>(3);

  async function fetchTab(t: Tab) {
    setLoading(prev => ({ ...prev, [t]: true }));
    try {
      if (t === "forecast") {
        const r = await authFetch(`${API}/analytics/sales-forecast`, { headers: headers() });
        if (r.ok) setSalesData(await r.json());
      } else if (t === "cashflow") {
        const r = await authFetch(`${API}/analytics/cashflow-prediction`, { headers: headers() });
        if (r.ok) setCashflowData(await r.json());
      } else if (t === "inventory") {
        const r = await authFetch(`${API}/analytics/inventory-optimization`, { headers: headers() });
        if (r.ok) setInventoryData(await r.json());
      } else if (t === "churn") {
        const r = await authFetch(`${API}/analytics/customer-risk`, { headers: headers() });
        if (r.ok) setCustomerRisk(await r.json());
      }
    } finally {
      setLoading(prev => ({ ...prev, [t]: false }));
    }
  }

  useEffect(() => {
    fetchTab("forecast");
  }, []);

  function handleTab(t: Tab) {
    setTab(t);
    const hasData = t === "forecast" ? salesData : t === "cashflow" ? cashflowData : t === "inventory" ? inventoryData : customerRisk;
    if (!hasData) fetchTab(t);
  }

  const tabs = [
    { id: "forecast" as Tab, label: "תחזית מכירות", icon: TrendingUp, color: "text-emerald-400" },
    { id: "cashflow" as Tab, label: "תזרים מזומנים", icon: DollarSign, color: "text-blue-400" },
    { id: "inventory" as Tab, label: "אופטימיזציית מלאי", icon: Package, color: "text-amber-400" },
    { id: "churn" as Tab, label: "סיכון לקוחות", icon: AlertTriangle, color: "text-red-400" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <Brain className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Predictive Analytics</h1>
          <p className="text-xs text-muted-foreground">תחזיות עסקיות מבוססות נתונים היסטוריים — ממוצעים נעים, רגרסיה, ניתוח עונתי</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => handleTab(t.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary text-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className={`w-4 h-4 ${tab === t.id ? "text-foreground" : t.color}`} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "forecast" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {loading.forecast ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />טוען תחזית...
            </div>
          ) : salesData ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "הכנסות חודש נוכחי", value: fmtK(salesData.kpis.currentMonthRevenue), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", trend: salesData.kpis.growthRate },
                  { label: "ממוצע חודשי (12m)", value: fmtK(salesData.kpis.avgMonthlyRevenue), icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", trend: null },
                  { label: "תחזית 3 חודשים", value: fmtK(salesData.kpis.forecastNext3), icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", trend: null },
                  { label: "הצעות מחיר ממתינות", value: String(salesData.kpis.pendingQuotes || 0), icon: Target, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", trend: null },
                ].map((k, i) => (
                  <div key={i} className={`border rounded-xl p-3 text-center ${k.bg}`}>
                    <k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} />
                    <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
                    {k.trend !== null && (
                      <div className={`flex items-center justify-center gap-1 text-xs mt-0.5 ${k.trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {k.trend >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(k.trend)}%
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
                  </div>
                ))}
              </div>

              {salesData.attentionItems.length > 0 && (
                <div className="space-y-2">
                  {salesData.attentionItems.map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                      item.severity === "critical" ? "bg-red-500/5 border-red-500/30 text-red-400" : "bg-amber-500/5 border-amber-500/30 text-amber-400"
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="font-medium">{item.label}:</span>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    הכנסות היסטוריות ותחזית {period} חודשים
                  </h3>
                  <div className="flex gap-1">
                    {([3, 6] as const).map(p => (
                      <button key={p} onClick={() => setPeriod(p)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${period === p ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {p}M
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const historicalFormatted = salesData.historical.map(r => ({
                    name: fmtMonth(r.month),
                    "הכנסות בפועל": Number(r.revenue),
                  }));
                  const forecastFormatted = salesData.forecast.slice(0, period).map(r => ({
                    name: fmtMonth(r.month),
                    "תחזית": r.predicted,
                    "תחזית עליונה": r.upper,
                    "תחזית תחתונה": r.lower,
                  }));
                  const combined = [
                    ...historicalFormatted.slice(-6),
                    ...forecastFormatted,
                  ];
                  return (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={combined}>
                        <defs>
                          <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="fcastGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={v => fmtK(v)} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="הכנסות בפועל" stroke="#10b981" fill="url(#histGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="תחזית" stroke="#8b5cf6" fill="url(#fcastGrad)" strokeWidth={2} strokeDasharray="5 3" />
                        <Area type="monotone" dataKey="תחזית עליונה" stroke="#8b5cf6" fill="none" strokeWidth={1} strokeDasharray="2 4" strokeOpacity={0.4} />
                        <Area type="monotone" dataKey="תחזית תחתונה" stroke="#8b5cf6" fill="none" strokeWidth={1} strokeDasharray="2 4" strokeOpacity={0.4} />
                      </AreaChart>
                    </ResponsiveContainer>
                  );
                })()}

                <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground">
                  {[
                    { name: "בפועל", color: "#10b981" },
                    { name: "תחזית (±12%)", color: "#8b5cf6" },
                  ].map(l => (
                    <div key={l.name} className="flex items-center gap-2">
                      <div className="w-5 h-0.5 rounded" style={{ backgroundColor: l.color }} />
                      <span>{l.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </motion.div>
      )}

      {tab === "cashflow" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {loading.cashflow ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />טוען תזרים...
            </div>
          ) : cashflowData ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "תזרים נטו חודש נוכחי", value: fmtK(cashflowData.kpis.currentNetCashflow), positive: cashflowData.kpis.currentNetCashflow >= 0 },
                  { label: "חייבים (AR) פתוחים", value: fmtK(cashflowData.kpis.totalOutstandingAR), positive: null },
                  { label: "זכאים (AP) פתוחים", value: fmtK(cashflowData.kpis.totalOutstandingAP), positive: null },
                  { label: "פוזיציה נטו", value: fmtK(cashflowData.kpis.netPosition), positive: cashflowData.kpis.netPosition >= 0 },
                  { label: "שיעור גבייה", value: `${cashflowData.kpis.collectionRate}%`, positive: cashflowData.kpis.collectionRate >= 85 },
                  { label: "ממוצע תזרים חודשי", value: fmtK(cashflowData.kpis.avgMonthlyNet), positive: cashflowData.kpis.avgMonthlyNet >= 0 },
                ].map((k, i) => (
                  <div key={i} className={`border rounded-xl p-3 text-center ${
                    k.positive === true ? "bg-emerald-500/10 border-emerald-500/20" :
                    k.positive === false ? "bg-red-500/10 border-red-500/20" :
                    "bg-card border-border"
                  }`}>
                    <div className={`text-lg font-bold ${
                      k.positive === true ? "text-emerald-400" : k.positive === false ? "text-red-400" : "text-foreground"
                    }`}>{k.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
                  </div>
                ))}
              </div>

              {cashflowData.attentionItems.length > 0 && (
                <div className="space-y-2">
                  {cashflowData.attentionItems.map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                      item.severity === "critical" ? "bg-red-500/5 border-red-500/30 text-red-400" : "bg-amber-500/5 border-amber-500/30 text-amber-400"
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="font-medium">{item.label}:</span>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-400" />
                  תזרים מזומנים היסטורי ותחזית
                </h3>
                {(() => {
                  const histData = cashflowData.historical.map(r => ({
                    name: fmtMonth(r.month),
                    "כניסות": r.inflow,
                    "יציאות": r.outflow,
                    "נטו": r.net,
                  }));
                  return (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={histData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={v => fmtK(v)} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                        <Bar dataKey="כניסות" fill="#10b981" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="יציאות" fill="#ef4444" radius={[2, 2, 0, 0]} />
                        <Line dataKey="נטו" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>

              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                  תחזית תזרים — 3 חודשים קדימה
                </h3>
                <div className="space-y-2">
                  {cashflowData.forecast.map((f, i) => {
                    const isPositive = f.projected >= 0;
                    return (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-border/50">
                        <span className="text-sm text-muted-foreground">{fmtMonth(f.month)}</span>
                        <div className="flex items-center gap-2">
                          {isPositive ? <ArrowUp className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowDown className="w-3.5 h-3.5 text-red-400" />}
                          <span className={`text-sm font-semibold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtK(Math.abs(f.projected))}
                          </span>
                          <span className="text-xs text-muted-foreground">({isPositive ? "עודף" : "גירעון"})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </motion.div>
      )}

      {tab === "inventory" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {loading.inventory ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />טוען מלאי...
            </div>
          ) : inventoryData ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "קריטי", value: inventoryData.kpis.critical, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
                  { label: "נמוך", value: inventoryData.kpis.low, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
                  { label: "עודף", value: inventoryData.kpis.excess, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                  { label: "תקין", value: inventoryData.kpis.optimal, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                ].map((k, i) => (
                  <div key={i} className={`border rounded-xl p-3 text-center ${k.bg}`}>
                    <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-400" />
                    ניתוח מלאי — {inventoryData.kpis.totalItems} פריטים | ערך כולל: {fmtK(inventoryData.kpis.totalValue)}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/20 text-muted-foreground text-xs">
                        <th className="px-4 py-2 text-right font-medium">שם</th>
                        <th className="px-4 py-2 text-right font-medium">קטגוריה</th>
                        <th className="px-4 py-2 text-right font-medium">מלאי</th>
                        <th className="px-4 py-2 text-right font-medium">מינימום</th>
                        <th className="px-4 py-2 text-right font-medium">מילוי</th>
                        <th className="px-4 py-2 text-right font-medium">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryData.items.slice(0, 20).map((item, i) => {
                        const statusConfig: Record<string, { label: string; color: string }> = {
                          critical: { label: "קריטי", color: "text-red-400 bg-red-500/10 border-red-500/30" },
                          low: { label: "נמוך", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
                          excess: { label: "עודף", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
                          optimal: { label: "תקין", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                        };
                        const sc = statusConfig[item.status] || statusConfig.optimal;
                        return (
                          <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                            className="border-t border-border/30 hover:bg-muted/5">
                            <td className="px-4 py-3 font-medium text-foreground text-xs">{item.name}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{item.category}</td>
                            <td className="px-4 py-3 text-foreground font-mono text-xs">{item.current_stock}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{item.min_stock}</td>
                            <td className="px-4 py-3 w-28">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${item.fill_rate < 30 ? "bg-red-500" : item.fill_rate < 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                                    style={{ width: `${item.fill_rate}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{item.fill_rate}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${sc.color}`}>{sc.label}</span>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </motion.div>
      )}

      {tab === "churn" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {loading.churn ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />טוען סיכון לקוחות...
            </div>
          ) : customerRisk ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "לקוחות בסיכון קריטי", value: customerRisk.distribution.critical, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
                  { label: "סיכון גבוה", value: customerRisk.distribution.high, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
                  { label: "חשיפה כוללת", value: fmtK(customerRisk.kpis.totalAtRiskBalance), color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
                  { label: "ממוצע ימי תשלום", value: `${customerRisk.kpis.avgDaysToPay} ימים`, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                ].map((k, i) => (
                  <div key={i} className={`border rounded-xl p-3 text-center ${k.bg}`}>
                    <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
                  </div>
                ))}
              </div>

              {customerRisk.attentionItems.length > 0 && (
                <div className="space-y-2">
                  {customerRisk.attentionItems.map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                      item.severity === "critical" ? "bg-red-500/5 border-red-500/30 text-red-400" : "bg-amber-500/5 border-amber-500/30 text-amber-400"
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="font-medium">{item.label}:</span>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {customerRisk.customers.slice(0, 15).map((c, i) => {
                  const riskConfig: Record<string, { label: string; color: string; border: string }> = {
                    critical: { label: "קריטי", color: "text-red-400", border: "border-red-500/30" },
                    high: { label: "גבוה", color: "text-orange-400", border: "border-orange-500/30" },
                    medium: { label: "בינוני", color: "text-amber-400", border: "border-amber-500/30" },
                    low: { label: "נמוך", color: "text-emerald-400", border: "border-emerald-500/30" },
                  };
                  const rc = riskConfig[c.riskLevel] || riskConfig.low;
                  return (
                    <div key={i} className={`bg-card border ${rc.border} rounded-xl p-4`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-foreground text-sm">{c.name}</h4>
                          <p className="text-xs text-muted-foreground">יתרה: {fmtK(c.balance)} · אשראי: {c.creditUtilization}%</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-xl font-bold ${rc.color}`}>{c.riskScore}</div>
                          <div className="text-[10px] text-muted-foreground">ציון סיכון</div>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full ${c.riskScore >= 70 ? "bg-red-500" : c.riskScore >= 50 ? "bg-orange-500" : c.riskScore >= 30 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${c.riskScore}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.factors.map((f, fi) => (
                          <span key={fi} className={`text-[10px] px-1.5 py-0.5 rounded ${rc.color} bg-opacity-10 border ${rc.border}`}>{f}</span>
                        ))}
                        {c.orderTrend !== 0 && (
                          <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${c.orderTrend < 0 ? "text-red-400 bg-red-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>
                            {c.orderTrend < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                            {Math.abs(c.orderTrend)}% מגמת הזמנות
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="predictive-analytics" />
        <RelatedRecords entityType="predictive-analytics" />
      </div>
    </div>
  );
}
