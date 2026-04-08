import { useState, useEffect, useMemo } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Users, Target,
  AlertTriangle, CheckCircle2, Clock, Printer, Download, Calendar,
  Package, ShoppingCart, FileText, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { motion } from "framer-motion";
import { printPage } from "@/lib/print-utils";
import ExportDropdown from "@/components/export-dropdown";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart
} from "recharts";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtC = (v: any) => `₪${fmt(v)}`;
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const MONTHS_SHORT = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 text-sm" dir="rtl">
      <div className="text-slate-300 font-medium mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground font-bold">{fmtC(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-medium">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function ExecutiveSummaryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("year");
  const [year, setYear] = useState(new Date().getFullYear());
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setLoading(true);
    authFetch(`${API}/executive-summary?period=${period}&year=${year}`, { headers })
      .then(r => r.json()).then(d => setData(d)).catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, [period, year]);

  const kpis = data?.kpis || {};
  const alerts = data?.alerts || [];
  const topItems = data?.topItems || {};
  const cashFlow = data?.cashFlow || {};
  const receivables = data?.receivables || {};
  const payables = data?.payables || {};

  const monthlyIncomeData = useMemo(() => {
    const monthly = data?.monthlyIncome || [];
    if (monthly.length > 0) return monthly;
    return MONTHS_SHORT.map((m, i) => ({ month: m, income: 0, expenses: 0 }));
  }, [data]);

  const cashFlowChartData = useMemo(() => {
    const monthly = data?.monthlyCashFlow || [];
    if (monthly.length > 0) return monthly;
    return MONTHS_SHORT.map((m) => ({ month: m, inflows: 0, outflows: 0 }));
  }, [data]);

  const topCustomersData = useMemo(() => {
    const tc = topItems.topCustomers || [];
    return tc.slice(0, 6).map((c: any) => ({
      name: (c.name || c.customer_name || "").substring(0, 12),
      value: Number(c.total || c.revenue || 0)
    }));
  }, [topItems]);

  const topProductsData = useMemo(() => {
    const tp = topItems.topProducts || [];
    return tp.slice(0, 6).map((p: any) => ({
      name: (p.name || p.product_name || "").substring(0, 12),
      value: Number(p.total || p.revenue || 0)
    }));
  }, [topItems]);

  const topSuppliersData = useMemo(() => {
    const ts = topItems.topSuppliers || [];
    return ts.slice(0, 6).map((s: any) => ({
      name: (s.name || s.supplier_name || "").substring(0, 12),
      value: Number(s.total || s.amount || 0)
    }));
  }, [topItems]);

  const topExpensesData = useMemo(() => {
    const te = topItems.topExpenses || [];
    return te.slice(0, 6).map((e: any) => ({
      name: (e.name || e.category || "").substring(0, 12),
      value: Number(e.total || e.amount || 0)
    }));
  }, [topItems]);

  const collectionBalanceData = useMemo(() => {
    const cb = data?.collectionBalance || [];
    if (cb.length > 0) return cb;
    return [
      { range: "שוטף", amount: Number(receivables.current || 0) },
      { range: "30+", amount: Number(receivables.overdue_30 || 0) },
      { range: "60+", amount: Number(receivables.overdue_60 || 0) },
      { range: "90+", amount: Number(receivables.overdue_90 || 0) },
    ];
  }, [data, receivables]);

  const supplierBalanceData = useMemo(() => {
    const sb = data?.supplierBalance || [];
    if (sb.length > 0) return sb;
    return [
      { range: "שוטף", amount: Number(payables.current || 0) },
      { range: "30+", amount: Number(payables.overdue_30 || 0) },
      { range: "60+", amount: Number(payables.overdue_60 || 0) },
      { range: "90+", amount: Number(payables.overdue_90 || 0) },
    ];
  }, [data, payables]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><BarChart3 className="text-violet-500" /> דוחות מנהלים</h1>
          <p className="text-muted-foreground mt-1">סקירה כללית, גרפים ודוחות מנהלים עם KPIs</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm bg-card">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex gap-1 border rounded-lg overflow-hidden">
            {[["month", "חודש"], ["quarter", "רבעון"], ["year", "שנה"]].map(([k, label]) => (
              <button key={k} onClick={() => setPeriod(k)}
                className={`px-3 py-2 text-sm transition-all ${period === k ? "bg-violet-600 text-foreground" : "hover:bg-muted/30"}`}>
                {label}
              </button>
            ))}
          </div>
          <ExportDropdown
            data={[{ period, revenue: kpis.revenue, expenses: kpis.expenses, net_profit: kpis.net_profit }]}
            headers={{ period: "תקופה", revenue: "הכנסות", expenses: "הוצאות", net_profit: "רווח נקי" }}
            filename="executive_summary"
          />
          <button onClick={() => printPage("דוחות מנהלים")}
            className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
            <Printer size={16} /> הדפסה
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-8 text-muted-foreground">טוען דוחות מנהלים...</div>}

      {!loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-xl border border-green-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="text-green-500" size={24} />
                {kpis.revenue_change !== undefined && (
                  <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-0.5 ${Number(kpis.revenue_change) >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {Number(kpis.revenue_change) >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(Number(kpis.revenue_change)).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-lg sm:text-2xl font-bold text-green-600">{fmtC(kpis.revenue)}</div>
              <div className="text-xs text-muted-foreground">הכנסות</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-gradient-to-br from-red-500/10 to-red-600/5 rounded-xl border border-red-200 p-4">
              <TrendingDown className="text-red-500 mb-2" size={24} />
              <div className="text-lg sm:text-2xl font-bold text-red-600">{fmtC(kpis.expenses)}</div>
              <div className="text-xs text-muted-foreground">הוצאות</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`bg-gradient-to-br rounded-xl border p-4 ${Number(kpis.net_profit) >= 0 ? 'from-blue-500/10 to-blue-600/5 border-blue-200' : 'from-red-500/10 to-red-600/5 border-red-200'}`}>
              <DollarSign className={`mb-2 ${Number(kpis.net_profit) >= 0 ? 'text-blue-500' : 'text-red-500'}`} size={24} />
              <div className={`text-lg sm:text-2xl font-bold ${Number(kpis.net_profit) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{fmtC(kpis.net_profit)}</div>
              <div className="text-xs text-muted-foreground">רווח נקי</div>
              <div className="text-xs text-muted-foreground">{Number(kpis.profit_margin || 0).toFixed(1)}% מרווח</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-xl border border-purple-200 p-4">
              <Target className="text-purple-500 mb-2" size={24} />
              <div className="text-lg sm:text-2xl font-bold text-purple-600">{fmtC(kpis.cash_balance)}</div>
              <div className="text-xs text-muted-foreground">יתרת מזומן</div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <BarChart3 size={18} className="text-green-600" />
                הכנסות (ללא מע"מ) — לפי חודש
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyIncomeData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="income" name="הכנסות" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <DollarSign size={18} className="text-blue-600" />
                תזרים מזומנים — הכנסות מול הוצאות
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={cashFlowChartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gInflows" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gOutflows" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="inflows" name="הכנסות" stroke="#22c55e" fill="url(#gInflows)" strokeWidth={2} />
                    <Area type="monotone" dataKey="outflows" name="הוצאות" stroke="#ef4444" fill="url(#gOutflows)" strokeWidth={2} />
                    <Legend formatter={(val) => <span className="text-xs text-muted-foreground">{val}</span>} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topCustomersData.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="bg-card rounded-xl shadow-sm border p-5">
                <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-sm">
                  <Users size={16} className="text-blue-600" /> לקוחות משמעותיים
                </h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={topCustomersData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        labelLine={false} label={PieLabel}>
                        {topCustomersData.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtC(v)} />
                      <Legend formatter={(val) => <span className="text-[10px] text-muted-foreground">{val}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            )}

            {topProductsData.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="bg-card rounded-xl shadow-sm border p-5">
                <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-sm">
                  <Package size={16} className="text-green-600" /> מוצרים משמעותיים
                </h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={topProductsData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        labelLine={false} label={PieLabel}>
                        {topProductsData.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtC(v)} />
                      <Legend formatter={(val) => <span className="text-[10px] text-muted-foreground">{val}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            )}

            {topSuppliersData.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="bg-card rounded-xl shadow-sm border p-5">
                <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-sm">
                  <ShoppingCart size={16} className="text-orange-600" /> ספקים משמעותיים
                </h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={topSuppliersData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        labelLine={false} label={PieLabel}>
                        {topSuppliersData.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[(i + 4) % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtC(v)} />
                      <Legend formatter={(val) => <span className="text-[10px] text-muted-foreground">{val}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
              className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-sm">
                <TrendingUp size={16} className="text-cyan-600" /> יתרת גביה — גיול חובות לקוחות
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={collectionBalanceData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="amount" name="סכום" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-sm">
                <TrendingDown size={16} className="text-orange-600" /> יתרת ספקים — גיול חובות ספקים
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={supplierBalanceData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="amount" name="סכום" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {topExpensesData.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
              className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-sm">
                <FileText size={16} className="text-red-500" /> הוצאות משמעותיות
              </h3>
              <div className="h-[200px] max-w-md mx-auto">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={topExpensesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      labelLine={false} label={PieLabel}>
                      {topExpensesData.map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtC(v)} />
                    <Legend formatter={(val) => <span className="text-[10px] text-muted-foreground">{val}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1"><Users size={16} className="text-blue-600" /> חייבים (AR)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>סה"כ יתרות</span><span className="font-bold text-blue-600">{fmtC(receivables.total)}</span></div>
                <div className="flex justify-between"><span>פתוחות</span><span className="font-bold">{receivables.open_count || 0}</span></div>
                <div className="flex justify-between text-red-600"><span>מעל 30 יום</span><span className="font-bold">{fmtC(receivables.overdue_30)}</span></div>
                <div className="flex justify-between text-red-700"><span>מעל 90 יום</span><span className="font-bold">{fmtC(receivables.overdue_90)}</span></div>
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1"><Users size={16} className="text-orange-600" /> חובות (AP)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>סה"כ יתרות</span><span className="font-bold text-orange-600">{fmtC(payables.total)}</span></div>
                <div className="flex justify-between"><span>פתוחות</span><span className="font-bold">{payables.open_count || 0}</span></div>
                <div className="flex justify-between text-yellow-600"><span>תשלומים קרובים</span><span className="font-bold">{fmtC(payables.due_soon)}</span></div>
                <div className="flex justify-between text-red-600"><span>באיחור</span><span className="font-bold">{fmtC(payables.overdue)}</span></div>
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1"><DollarSign size={16} className="text-green-600" /> תזרים מזומנים</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>הכנסות</span><span className="font-bold text-green-600">{fmtC(cashFlow.inflows)}</span></div>
                <div className="flex justify-between"><span>הוצאות</span><span className="font-bold text-red-600">{fmtC(cashFlow.outflows)}</span></div>
                <div className={`flex justify-between font-bold ${Number(cashFlow.net) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>נטו</span>
                  <span>{fmtC(cashFlow.net)}</span>
                </div>
              </div>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1"><AlertTriangle size={16} className="text-yellow-500" /> התראות ותשומת לב</h3>
              <div className="space-y-2">
                {alerts.map((alert: any, i: number) => (
                  <div key={i} className={`flex items-start gap-2 p-3 rounded-lg text-sm ${alert.type === "danger" ? "bg-red-50 border border-red-200" : alert.type === "warning" ? "bg-yellow-50 border border-yellow-200" : "bg-blue-50 border border-blue-200"}`}>
                    {alert.type === "danger" ? <AlertTriangle size={16} className="text-red-500 mt-0.5" /> : alert.type === "warning" ? <Clock size={16} className="text-yellow-500 mt-0.5" /> : <CheckCircle2 size={16} className="text-blue-500 mt-0.5" />}
                    <div>
                      <div className="font-medium">{alert.title}</div>
                      <div className="text-muted-foreground text-xs">{alert.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gradient-to-r from-violet-50 to-blue-50 rounded-xl border border-violet-200 p-5">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <FileText size={18} className="text-violet-600" /> דוחות חשובים
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "דוח הכנסות והוצאות", href: "/finance/income-expenses-report", icon: BarChart3, color: "bg-green-100 text-green-700" },
                { label: "חייבים / יתרות", href: "/finance/debtors-balances", icon: Users, color: "bg-red-100 text-red-700" },
                { label: "רווח תפעולי", href: "/finance/operational-profit", icon: TrendingUp, color: "bg-blue-100 text-blue-700" },
                { label: "דוחות כספיים", href: "/finance/reports", icon: FileText, color: "bg-purple-100 text-purple-700" },
              ].map((r, i) => (
                <a key={i} href={r.href}
                  className="flex items-center gap-2 p-3 bg-card rounded-lg border hover:shadow-md transition-all cursor-pointer">
                  <div className={`p-2 rounded-lg ${r.color}`}>
                    <r.icon size={16} />
                  </div>
                  <span className="text-sm font-medium text-foreground">{r.label}</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">רשומות קשורות</h3>
          <RelatedRecords entityType="executive-summary" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">היסטוריה</h3>
          <ActivityLog entityType="executive-summary" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
