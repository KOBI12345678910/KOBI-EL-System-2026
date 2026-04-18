import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Users,
  Factory, Truck, ClipboardList, FileText, Target, Briefcase, Wrench,
  Shield, HeadphonesIcon, BarChart3, Activity, ArrowUpRight, ArrowDownRight,
  Layers, AlertTriangle, CheckCircle2, Clock, Zap
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { LoadingSkeleton } from "@/components/ui/unified-states";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];
const MONTH_NAMES_HE: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרץ", "04": "אפר", "05": "מאי", "06": "יונ",
  "07": "יול", "08": "אוג", "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};

function formatMonth(m: string) {
  const parts = m.split("-");
  return MONTH_NAMES_HE[parts[1]] || parts[1];
}

function formatNum(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(0) + "K";
  return n.toLocaleString("he-IL");
}

function formatCurrency(n: number) {
  return "₪" + formatNum(n);
}

function KpiCard({ title, value, subtitle, icon: Icon, color, trend, trendValue }: {
  title: string; value: string | number; subtitle?: string;
  icon: any; color: string; trend?: "up" | "down" | "neutral";
  trendValue?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon size={20} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            trend === "up" ? "bg-green-500/10 text-green-400" :
            trend === "down" ? "bg-red-500/10 text-red-400" :
            "bg-slate-500/10 text-muted-foreground"
          }`}>
            {trend === "up" ? <ArrowUpRight size={12} /> : trend === "down" ? <ArrowDownRight size={12} /> : <Activity size={12} />}
            {trendValue}
          </div>
        )}
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground mt-1">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</div>}
    </motion.div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card border border-border rounded-2xl p-5 ${className}`}
    >
      <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
        <BarChart3 size={16} className="text-primary" />
        {title}
      </h3>
      {children}
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs" dir="rtl">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}: </span>
          <span className="font-medium">{typeof p.value === "number" ? p.value.toLocaleString("he-IL") : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardKPI() {
  const token = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
  const headers: any = { Authorization: `Bearer ${token}` };

  const { data: kpis } = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: async () => {
      const r = await authFetch(`${API}/dashboard/kpis`, { headers });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: salesChart = [] } = useQuery({
    queryKey: ["dashboard-sales-chart"],
    queryFn: async () => {
      const r = await authFetch(`${API}/dashboard/charts/sales-monthly`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: revenueChart = [] } = useQuery({
    queryKey: ["dashboard-revenue-chart"],
    queryFn: async () => {
      const r = await authFetch(`${API}/dashboard/charts/revenue-expenses`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: woStatus = [] } = useQuery({
    queryKey: ["dashboard-wo-status-chart"],
    queryFn: async () => {
      const r = await authFetch(`${API}/dashboard/charts/work-orders-status`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: deptChart = [] } = useQuery({
    queryKey: ["dashboard-dept-chart"],
    queryFn: async () => {
      const r = await authFetch(`${API}/dashboard/charts/departments`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: topCustomers = [] } = useQuery({
    queryKey: ["dashboard-top-customers"],
    queryFn: async () => {
      const r = await authFetch(`${API}/dashboard/charts/top-customers`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: activityChart = [] } = useQuery({
    queryKey: ["dashboard-activity-chart"],
    queryFn: async () => {
      const r = await authFetch(`${API}/dashboard/charts/recent-activity`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  if (!kpis) return <LoadingSkeleton variant="dashboard" rows={6} className="p-6" />;

  const s = kpis.sales || {};
  const p = kpis.purchases || {};
  const w = kpis.workOrders || {};
  const e = kpis.employees || {};
  const c = kpis.customers || {};
  const sup = kpis.suppliers || {};
  const prod = kpis.products || {};
  const inv = kpis.invoices || {};
  const proj = kpis.projects || {};
  const lead = kpis.leads || {};
  const mat = kpis.materials || {};
  const maint = kpis.maintenance || {};
  const qual = kpis.quality || {};
  const supp = kpis.support || {};

  const salesChartData = salesChart.map((r: any) => ({ name: formatMonth(r.month), הזמנות: r.count, ערך: Number(r.value) }));
  const revenueChartData = revenueChart.map((r: any) => ({ name: formatMonth(r.month), הכנסות: Number(r.revenue), הוצאות: Number(r.expenses), רווח: Number(r.profit) }));
  const activityData = activityChart.map((r: any) => ({
    name: new Date(r.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }),
    יצירות: r.inserts, עדכונים: r.updates, מחיקות: r.deletes
  }));
  const topCustData = topCustomers.map((r: any) => ({ name: r.name?.substring(0, 15) || "?", ערך: Number(r.total_value), הזמנות: r.order_count }));

  const totalRevenue = Number(inv.total_value || 0);
  const totalExpenses = Number(p.total_value || 0);
  const grossProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard title="הכנסות (חשבוניות)" value={formatCurrency(totalRevenue)} icon={DollarSign}
          color="bg-green-500/10 text-green-400" trend="up" trendValue={`${inv.total} חשבוניות`}
          subtitle={`חודשי: ${formatCurrency(Number(inv.monthly_value || 0))}`} />
        <KpiCard title="הזמנות מכירה" value={s.total || 0} icon={ShoppingCart}
          color="bg-blue-500/10 text-blue-400" trend="up" trendValue={`${s.monthly_count || 0} חודשי`}
          subtitle={`ערך: ${formatCurrency(Number(s.total_value || 0))}`} />
        <KpiCard title="הזמנות רכש" value={p.total || 0} icon={Truck}
          color="bg-purple-500/10 text-purple-400" trend="neutral" trendValue={`${p.monthly_count || 0} חודשי`}
          subtitle={`ערך: ${formatCurrency(Number(p.total_value || 0))}`} />
        <KpiCard title="הוראות עבודה" value={w.total || 0} icon={ClipboardList}
          color="bg-amber-500/10 text-amber-400" trend={w.critical > 0 ? "down" : "up"}
          trendValue={w.critical > 0 ? `${w.critical} דחופות` : `${w.completed || 0} הושלמו`}
          subtitle={`${w.in_progress || 0} בביצוע | ${w.planned || 0} מתוכנן`} />
        <KpiCard title="לקוחות" value={c.total || 0} icon={Users}
          color="bg-cyan-500/10 text-cyan-400" trend="up" trendValue={`${c.new_monthly || 0} חדשים`}
          subtitle={`${c.active || 0} פעילים`} />
        <KpiCard title="ספקים" value={sup.total || 0} icon={Briefcase}
          color="bg-orange-500/10 text-orange-400" trend="neutral" trendValue={`${sup.active || 0} פעילים`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard title="מוצרים" value={prod.total || 0} icon={Package}
          color="bg-indigo-500/10 text-indigo-400" subtitle={`${prod.active || 0} פעילים`} />
        <KpiCard title="עובדים" value={e.total || 0} icon={Users}
          color="bg-teal-500/10 text-teal-400" trend="up" trendValue={`${e.new_hires || 0} חדשים`}
          subtitle={`${e.active || 0} פעילים`} />
        <KpiCard title="פרויקטים" value={proj.total || 0} icon={Target}
          color="bg-rose-500/10 text-rose-400" subtitle={`${proj.active || 0} פעילים | ${proj.completed || 0} הושלמו`}
          trend={proj.active > 0 ? "up" : "neutral"} trendValue={proj.active > 0 ? "פעיל" : "—"} />
        <KpiCard title="לידים" value={lead.total || 0} icon={Zap}
          color="bg-yellow-500/10 text-yellow-400" trend="up" trendValue={`${lead.monthly_count || 0} חודשי`}
          subtitle={`${lead.converted || 0} הומרו | ${lead.in_progress || 0} בטיפול`} />
        <KpiCard title="תחזוקה" value={maint.total || 0} icon={Wrench}
          color="bg-slate-500/10 text-muted-foreground" subtitle={`${maint.open_orders || 0} פתוחות`} />
        <KpiCard title="רווח גולמי" value={formatCurrency(grossProfit)} icon={TrendingUp}
          color={grossProfit >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}
          trend={grossProfit >= 0 ? "up" : "down"} trendValue={`${profitMargin}%`} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10"><AlertTriangle size={18} className="text-amber-400" /></div>
          <div><div className="text-lg font-bold">{mat.low_stock || 0}</div><div className="text-xs text-muted-foreground">מלאי נמוך</div></div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10"><FileText size={18} className="text-red-400" /></div>
          <div><div className="text-lg font-bold">{inv.overdue_count || 0}</div><div className="text-xs text-muted-foreground">חשבוניות באיחור</div></div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle2 size={18} className="text-green-400" /></div>
          <div><div className="text-lg font-bold">{qual.passed || 0}/{qual.total || 0}</div><div className="text-xs text-muted-foreground">עברו בדיקת איכות</div></div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10"><HeadphonesIcon size={18} className="text-blue-400" /></div>
          <div><div className="text-lg font-bold">{supp.open_tickets || 0}</div><div className="text-xs text-muted-foreground">פניות תמיכה פתוחות</div></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="הכנסות מול הוצאות — חודשי">
          {revenueChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={11} tickFormatter={v => formatNum(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="הכנסות" stroke="#10b981" fill="url(#colorRev)" strokeWidth={2} />
                <Area type="monotone" dataKey="הוצאות" stroke="#ef4444" fill="url(#colorExp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">אין נתונים חודשיים</div>}
        </ChartCard>

        <ChartCard title="הזמנות מכירה — חודשי">
          {salesChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={salesChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={11} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="הזמנות" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">אין נתונים חודשיים</div>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="סטטוס הוראות עבודה">
          {woStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={woStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name" label={({ name, value }) => `${name} (${value})`}>
                  {woStatus.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">אין הוראות עבודה</div>}
        </ChartCard>

        <ChartCard title="לקוחות מובילים — ערך הזמנות">
          {topCustData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCustData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" stroke="#666" fontSize={11} tickFormatter={v => formatNum(v)} />
                <YAxis type="category" dataKey="name" stroke="#666" fontSize={10} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ערך" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">אין נתוני לקוחות</div>}
        </ChartCard>

        <ChartCard title="עובדים לפי מחלקה">
          {deptChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={deptChart} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, value }) => `${name} (${value})`}>
                  {deptChart.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">אין נתוני מחלקות</div>}
        </ChartCard>
      </div>

      {activityData.length > 0 && (
        <ChartCard title="פעילות במערכת — 14 ימים אחרונים">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#666" fontSize={11} />
              <YAxis stroke="#666" fontSize={11} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="יצירות" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="עדכונים" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="מחיקות" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
