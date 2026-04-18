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
  Layers, AlertTriangle, CheckCircle2, Clock, Zap, BarChart2, HeartPulse
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { LoadingSkeleton } from "@/components/ui/unified-states";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const DASHBOARD_STALE_TIME = 5 * 60 * 1000;
const DASHBOARD_QUERY_TIMEOUT_MS = 10_000;

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

function hasNonZeroData(data: Array<Record<string, unknown>>, keys: string[]): boolean {
  return data.some(row => keys.some(key => Number(row[key] ?? 0) !== 0));
}

function ChartEmptyState({ height = 280, label = "אין נתונים עדיין" }: { height?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground" style={{ height }}>
      <BarChart2 className="w-10 h-10 opacity-20" />
      <p className="text-sm">{label}</p>
      <p className="text-xs opacity-60">יתעדכן כשיהיו נתונים במערכת</p>
    </div>
  );
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
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs">
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

const FALLBACK_KPIS = null;

export default function DashboardKPI() {
  const token = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
  const headers: any = { Authorization: `Bearer ${token}` };

  const { data: kpis, isError: kpisError, isLoading: kpisLoading, isSuccess: kpisLoaded, refetch: refetchKpis } = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/dashboard/kpis`, { headers });
      if (!r.ok) throw new Error(`Dashboard KPIs: ${r.status}`);
      return r.json();
    }),
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev: any) => prev ?? null,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: salesChart = [] } = useQuery({
    queryKey: ["dashboard-sales-chart"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/dashboard/charts/sales-monthly`, { headers });
      if (!r.ok) return [];
      return r.json();
    }),
    enabled: kpisLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: revenueChart = [] } = useQuery({
    queryKey: ["dashboard-revenue-chart"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/dashboard/charts/revenue-expenses`, { headers });
      if (!r.ok) return [];
      return r.json();
    }),
    enabled: kpisLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: woStatus = [] } = useQuery({
    queryKey: ["dashboard-wo-status-chart"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/dashboard/charts/work-orders-status`, { headers });
      if (!r.ok) return [];
      return r.json();
    }),
    enabled: kpisLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: healthScore = null } = useQuery({
    queryKey: ["dashboard-health-score"],
    queryFn: withQueryTimeout(async () => {
      try {
        const r = await authFetch(`${API}/dashboard/health-score`, { headers });
        if (!r.ok) return null;
        const d = await r.json();
        if (!d || d.health_score == null) return null;
        return d;
      } catch { return null; }
    }),
    enabled: kpisLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: deptChart = [] } = useQuery({
    queryKey: ["dashboard-dept-chart"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/dashboard/charts/departments`, { headers });
      if (!r.ok) return [];
      return r.json();
    }),
    enabled: kpisLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: topCustomers = [] } = useQuery({
    queryKey: ["dashboard-top-customers"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/dashboard/charts/top-customers`, { headers });
      if (!r.ok) return [];
      return r.json();
    }),
    enabled: kpisLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: activityChart = [] } = useQuery({
    queryKey: ["dashboard-activity-chart"],
    queryFn: withQueryTimeout(async () => {
      const r = await authFetch(`${API}/dashboard/charts/recent-activity`, { headers });
      if (!r.ok) return [];
      return r.json();
    }),
    enabled: kpisLoaded,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_STALE_TIME,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  if (kpisLoading) return <LoadingSkeleton variant="dashboard" rows={6} className="p-6" />;

  if (kpisError || !kpis) return (
    <div className="p-6 text-center" dir="rtl">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{kpisError ? "שגיאה בטעינת נתוני הדשבורד" : "טוען נתונים..."}</h3>
        <p className="text-sm text-muted-foreground mb-4">{kpisError ? "לא ניתן לטעון את הנתונים. ייתכן שהבקשה ארכה זמן רב מדי או שיש בעיית רשת." : "אנא המתן"}</p>
        {kpisError && <button
          onClick={() => refetchKpis()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          נסה שוב
        </button>}
      </div>
    </div>
  );

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

  const totalRevenue = Number(s.total_value || 0);
  const totalExpenses = Number(p.total_value || 0);
  const grossProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        {healthScore ? (
          <KpiCard title="בריאות העסק" value={`${healthScore.health_score}%`} icon={Shield}
            color="bg-cyan-500/10 text-cyan-400" trend={healthScore.health_score >= 70 ? "up" : healthScore.health_score >= 50 ? "neutral" : "down"}
            trendValue={healthScore.status === 'healthy' ? 'בריא' : healthScore.has_data === false || healthScore.status === 'insufficient_data' ? 'אין מספיק נתונים' : 'דורש תשומת לב'}
            subtitle={`${healthScore.work_order_completion || 0}% הזמנות מושלמות`} />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-slate-500/10 text-slate-400">
                <HeartPulse size={20} />
              </div>
            </div>
            <div className="text-xl font-bold tracking-tight text-muted-foreground">—</div>
            <div className="text-sm text-muted-foreground mt-1">בריאות העסק</div>
            <div className="text-xs text-muted-foreground/60 mt-0.5">יתעדכן עם נתוני המערכת</div>
          </motion.div>
        )}
        <KpiCard title="הכנסות (מכירות)" value={formatCurrency(totalRevenue)} icon={DollarSign}
          color="bg-green-500/10 text-green-400" trend="up" trendValue={`${s.total || 0} הזמנות`}
          subtitle={`חודשי: ${formatCurrency(Number(s.monthly_value || 0))}`} />
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
          {revenueChartData.length > 0 && hasNonZeroData(revenueChartData, ["הכנסות", "הוצאות"]) ? (
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
          ) : <ChartEmptyState height={280} label="אין נתוני הכנסות/הוצאות עדיין" />}
        </ChartCard>

        <ChartCard title="הזמנות מכירה — חודשי">
          {salesChartData.length > 0 && hasNonZeroData(salesChartData, ["הזמנות"]) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={salesChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={11} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="הזמנות" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmptyState height={280} label="אין נתוני הזמנות מכירה עדיין" />}
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
          {topCustData.length > 0 && hasNonZeroData(topCustData, ["ערך"]) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topCustData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" stroke="#666" fontSize={11} tickFormatter={v => formatNum(v)} />
                <YAxis type="category" dataKey="name" stroke="#666" fontSize={10} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ערך" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmptyState height={250} label="אין נתוני לקוחות עדיין" />}
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

      <ChartCard title="פעילות במערכת — 14 ימים אחרונים">
        {activityData.length > 0 && hasNonZeroData(activityData, ["יצירות", "עדכונים", "מחיקות"]) ? (
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
        ) : <ChartEmptyState height={220} label="אין נתוני פעילות עדיין" />}
      </ChartCard>
    </div>
  );
}
