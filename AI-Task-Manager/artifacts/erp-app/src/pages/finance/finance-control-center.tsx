import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { LayoutDashboard, DollarSign, TrendingUp, TrendingDown, CreditCard, Wallet, ArrowUpDown, AlertTriangle, Clock, CheckCircle2, BarChart3, Loader2, RefreshCw, Building2, Users, Briefcase } from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function FinanceControlCenterPage() {
  const { data: financecontrolcenterData } = useQuery({
    queryKey: ["finance-control-center"],
    queryFn: () => authFetch("/api/finance/finance_control_center"),
    staleTime: 5 * 60 * 1000,
  });

  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}` };

  const load = () => {
    setLoading(true);
    fetch(`${API}/finance-control/dashboard`, { headers })
      .then(r => r.json()).then(d => setData(d)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const kpis = [
    { label: "הכנסות", value: `₪${fmt(data.revenue?.total_revenue)}`, sub: `חודשי: ₪${fmt(data.revenue?.monthly_revenue)}`, icon: TrendingUp, color: "from-green-500/20 to-green-600/10", textColor: "text-green-400" },
    { label: "הוצאות", value: `₪${fmt(data.expenses?.total_expenses)}`, sub: `חודשי: ₪${fmt(data.expenses?.monthly_expenses)}`, icon: TrendingDown, color: "from-red-500/20 to-red-600/10", textColor: "text-red-400" },
    { label: "רווח נקי", value: `₪${fmt(data.netIncome)}`, sub: `יחס נוכחי: ${data.currentRatio}`, icon: DollarSign, color: "from-blue-500/20 to-blue-600/10", textColor: "text-blue-400" },
    { label: "חייבים (AR)", value: `₪${fmt(data.receivable?.total_ar)}`, sub: `באיחור: ₪${fmt(data.receivable?.overdue_ar)}`, icon: ArrowUpDown, color: "from-amber-500/20 to-amber-600/10", textColor: "text-amber-400" },
    { label: "זכאים (AP)", value: `₪${fmt(data.payable?.total_ap)}`, sub: `באיחור: ₪${fmt(data.payable?.overdue_ap)}`, icon: CreditCard, color: "from-purple-500/20 to-purple-600/10", textColor: "text-purple-400" },
    { label: "תקציב", value: `₪${fmt(data.budgetSummary?.total_budget)}`, sub: `נוצל: ₪${fmt(data.budgetSummary?.total_spent)}`, icon: Wallet, color: "from-cyan-500/20 to-cyan-600/10", textColor: "text-cyan-400" },
  ];

  const cashflowData = [
    { name: "כניסות", value: Number(data.cashflow?.total_inflow || 0) },
    { name: "יציאות", value: Number(data.cashflow?.total_outflow || 0) },
  ];
  const COLORS = ["#22c55e", "#ef4444", "#3b82f6", "#f59e0b"];

  if (loading) return <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-blue-400 to-cyan-300 bg-clip-text text-transparent flex items-center gap-3">
              <LayoutDashboard className="w-8 h-8 text-blue-400" />
              מרכז בקרה פיננסי
            </h1>
            <p className="text-muted-foreground mt-1">סקירה כוללת של המצב הפיננסי של הארגון</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition">
            <RefreshCw className="w-4 h-4" /> רענון
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`bg-gradient-to-br ${kpi.color} border border-white/10 rounded-xl p-5`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${kpi.textColor}`}>{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                </div>
                <kpi.icon className={`w-10 h-10 ${kpi.textColor} opacity-50`} />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" /> תזרים מזומנים
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={cashflowData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ₪${fmt(value)}`}>
                  {cashflowData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `₪${fmt(v)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-green-400" /> יתרות בנקאיות
            </h3>
            <div className="space-y-3 max-h-[250px] overflow-y-auto">
              {(data.bankBalances || []).length === 0 && <p className="text-muted-foreground text-center py-8">אין חשבונות בנק</p>}
              {(data.bankBalances || []).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between bg-card/5 rounded-lg p-3">
                  <div>
                    <p className="font-medium">{b.account_name}</p>
                    <p className="text-xs text-muted-foreground">{b.bank_name} - {b.account_number}</p>
                  </div>
                  <span className={`font-bold ${Number(b.balance) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ₪{fmt(b.balance)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card border border-white/10 rounded-xl p-5">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" /> פקודות יומן אחרונות
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground border-b border-white/10">
                <th className="text-right py-2 px-3">מספר</th>
                <th className="text-right py-2 px-3">תיאור</th>
                <th className="text-right py-2 px-3">חובה</th>
                <th className="text-right py-2 px-3">זכות</th>
                <th className="text-right py-2 px-3">תאריך</th>
                <th className="text-right py-2 px-3">סטטוס</th>
              </tr></thead>
              <tbody>
                {(data.recentJournals || []).length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">אין פקודות יומן</td></tr>}
                {(data.recentJournals || []).map((j: any) => (
                  <tr key={j.id} className="border-b border-white/5 hover:bg-card/5">
                    <td className="py-2 px-3 font-mono text-blue-400">{j.entry_number}</td>
                    <td className="py-2 px-3">{j.description}</td>
                    <td className="py-2 px-3 text-red-400">₪{fmt(j.total_debit)}</td>
                    <td className="py-2 px-3 text-green-400">₪{fmt(j.total_credit)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{j.entry_date?.slice(0, 10)}</td>
                    <td className="py-2 px-3"><span className="px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-300">{j.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "חשבוניות פתוחות (AR)", count: data.receivable?.ar_count || 0, value: `₪${fmt(data.receivable?.total_ar)}`, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "חשבונות לתשלום (AP)", count: data.payable?.ap_count || 0, value: `₪${fmt(data.payable?.total_ap)}`, color: "text-purple-400", bg: "bg-purple-500/10" },
            { label: "חשבוניות מכירה", count: data.revenue?.invoice_count || 0, value: `₪${fmt(data.revenue?.total_revenue)}`, color: "text-green-400", bg: "bg-green-500/10" },
            { label: "הוצאות", count: data.expenses?.expense_count || 0, value: `₪${fmt(data.expenses?.total_expenses)}`, color: "text-red-400", bg: "bg-red-500/10" },
          ].map((card, i) => (
            <div key={i} className={`${card.bg} border border-white/10 rounded-xl p-4`}>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.count} רשומות</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
