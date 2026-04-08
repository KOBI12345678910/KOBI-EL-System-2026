import { useState, useEffect } from "react";
import { BarChart3, DollarSign, TrendingUp, TrendingDown, Wallet, Receipt, Scale, FileText, PiggyBank, Building2, RefreshCw, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import { printPage } from "@/lib/print-utils";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/ui/unified-states";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function FinancialReportsPage() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { toast } = useToast();
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setLoading(true);
    setFetchError(null);
    authFetch(`${API}/financial-reports/overview`, { headers })
      .then(r => r.json())
      .then(d => setData(d || {}))
      .catch((err: any) => {
        const msg = err?.message || "שגיאה בטעינת הדוחות הפיננסיים";
        setFetchError(msg);
        toast({ title: "שגיאה", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const kpis = [
    { label: "סה\"כ נכסים", value: `₪${fmt(data.totalAssets)}`, icon: Building2, color: "from-blue-500 to-blue-600", textColor: "text-foreground" },
    { label: "סה\"כ התחייבויות", value: `₪${fmt(data.totalLiabilities)}`, icon: Receipt, color: "from-red-500 to-red-600", textColor: "text-foreground" },
    { label: "הון עצמי", value: `₪${fmt(data.totalEquity)}`, icon: Scale, color: "from-purple-500 to-purple-600", textColor: "text-foreground" },
    { label: "רווח נקי", value: `₪${fmt(data.netIncome)}`, icon: TrendingUp, color: Number(data.netIncome) >= 0 ? "from-green-500 to-green-600" : "from-red-500 to-red-600", textColor: "text-foreground" },
  ];

  const details = [
    { label: "הכנסות", value: `₪${fmt(data.totalRevenue)}`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
    { label: "הוצאות", value: `₪${fmt(data.totalExpenses)}`, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
    { label: "יתרת מזומנים", value: `₪${fmt(data.cashBalance)}`, icon: Wallet, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "חייבים (AR)", value: `₪${fmt(data.receivables)}`, sub: `${fmt(data.receivablesCount)} חשבוניות פתוחות`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "זכאים (AP)", value: `₪${fmt(data.payables)}`, sub: `${fmt(data.payablesCount)} חשבוניות פתוחות`, icon: Receipt, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "חבות מס", value: `₪${fmt(data.taxLiabilities)}`, icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "הוצאות חודשיות", value: `₪${fmt(data.monthlyExpenses)}`, icon: Calendar, color: "text-pink-600", bg: "bg-pink-50" },
    { label: "פקודות יומן", value: fmt(data.journalEntries), sub: `${fmt(data.postedEntries)} רשומות`, icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  const budgetUtil = data.budgetTotal > 0 ? ((data.budgetActual / data.budgetTotal) * 100).toFixed(1) : "0";
  const workingCapital = (data.totalAssets || 0) - (data.totalLiabilities || 0);
  const currentRatio = data.totalLiabilities > 0 ? (data.totalAssets / data.totalLiabilities).toFixed(2) : "N/A";
  const profitMargin = data.totalRevenue > 0 ? ((data.netIncome / data.totalRevenue) * 100).toFixed(1) : "0";

  if (fetchError && !loading) {
    return <QueryError error={fetchError} onRetry={load} />;
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><BarChart3 className="text-indigo-600" /> דוחות כספיים מאוחדים</h1>
          <p className="text-muted-foreground mt-1">סקירה מרכזית של מצב פיננסי — נכסים, התחייבויות, הון, רווחיות ותקציב</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 bg-indigo-600 text-foreground px-3 py-2 rounded-lg hover:bg-indigo-700 text-sm"><RefreshCw size={16} /> רענון</button>
          <button onClick={() => printPage("דוחות כספיים מאוחדים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-muted/40" />)}
        </div>
      ) : (<>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className={`bg-gradient-to-br ${kpi.color} rounded-2xl shadow-lg p-5 ${kpi.textColor}`}>
              <kpi.icon className="mb-2 opacity-80" size={28} />
              <div className="text-lg sm:text-2xl font-bold">{kpi.value}</div>
              <div className="text-sm opacity-80">{kpi.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {details.map((d, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
              className={`${d.bg} rounded-xl border p-4`}>
              <d.icon className={`${d.color} mb-1`} size={20} />
              <div className={`text-lg font-bold ${d.color}`}>{d.value}</div>
              <div className="text-xs text-muted-foreground">{d.label}</div>
              {d.sub && <div className="text-xs text-muted-foreground mt-0.5">{d.sub}</div>}
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="bg-card rounded-xl shadow-sm border p-5">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><PiggyBank size={18} className="text-indigo-600" /> ניצול תקציב</h3>
            <div className="flex items-center gap-4 mb-2">
              <div className="flex-1">
                <div className="h-6 bg-muted/50 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${Number(budgetUtil) > 90 ? 'bg-red-500' : Number(budgetUtil) > 70 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(Number(budgetUtil), 100)}%` }}></div>
                </div>
              </div>
              <div className="text-lg sm:text-2xl font-bold">{budgetUtil}%</div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>בפועל: ₪{fmt(data.budgetActual)}</span>
              <span>תקציב: ₪{fmt(data.budgetTotal)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{fmt(data.budgetCount)} תקציבים פעילים</div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            className="bg-card rounded-xl shadow-sm border p-5">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Scale size={18} className="text-purple-600" /> יחסים פיננסיים</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">הון חוזר</span>
                <span className={`font-bold ${workingCapital >= 0 ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(workingCapital)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">יחס שוטף</span>
                <span className="font-bold text-blue-600">{currentRatio}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">שיעור רווח</span>
                <span className={`font-bold ${Number(profitMargin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profitMargin}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">AR / AP</span>
                <span className="font-bold text-indigo-600">
                  {data.payables > 0 ? (data.receivables / data.payables).toFixed(2) : "N/A"}
                </span>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="bg-card rounded-xl shadow-sm border p-5">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><BarChart3 size={18} className="text-teal-600" /> התפלגות נכסים</h3>
            <div className="space-y-2">
              {[
                { label: "מזומנים ובנקים", value: data.cashBalance, color: "bg-blue-500" },
                { label: "חייבים", value: data.receivables, color: "bg-emerald-500" },
                { label: "נכסים אחרים", value: Math.max(0, (data.totalAssets || 0) - (data.cashBalance || 0) - (data.receivables || 0)), color: "bg-purple-500" },
              ].map((item, i) => {
                const total = data.totalAssets || 1;
                const pct = (Number(item.value || 0) / total * 100);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                    <span className="text-xs text-muted-foreground flex-1">{item.label}</span>
                    <span className="text-xs font-bold">₪{fmt(item.value)}</span>
                    <span className="text-xs text-muted-foreground w-10 text-left">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 h-3 bg-muted/50 rounded-full overflow-hidden flex">
              {[
                { value: data.cashBalance, color: "bg-blue-500" },
                { value: data.receivables, color: "bg-emerald-500" },
                { value: Math.max(0, (data.totalAssets || 0) - (data.cashBalance || 0) - (data.receivables || 0)), color: "bg-purple-500" },
              ].map((item, i) => {
                const total = data.totalAssets || 1;
                const pct = (Number(item.value || 0) / total * 100);
                return <div key={i} className={`${item.color} h-full`} style={{ width: `${pct}%` }}></div>;
              })}
            </div>
          </motion.div>
        </div>

        <div className="bg-card rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">סיכום ביצועים פיננסיים</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b"><tr>
                <th className="px-4 py-3 text-right font-medium">קטגוריה</th>
                <th className="px-4 py-3 text-right font-medium">סכום</th>
                <th className="px-4 py-3 text-right font-medium">פרטים</th>
              </tr></thead>
              <tbody>
                {[
                  { cat: "נכסים כוללים", val: data.totalAssets, detail: `כולל מזומנים ₪${fmt(data.cashBalance)}` },
                  { cat: "התחייבויות כוללות", val: data.totalLiabilities, detail: `כולל AP ₪${fmt(data.payables)}` },
                  { cat: "הון עצמי", val: data.totalEquity, detail: "סכום ההון של בעלי המניות" },
                  { cat: "הכנסות", val: data.totalRevenue, detail: "סה\"כ הכנסות לתקופה" },
                  { cat: "הוצאות", val: data.totalExpenses, detail: `הוצאות חודש נוכחי ₪${fmt(data.monthlyExpenses)}` },
                  { cat: "רווח נקי", val: data.netIncome, detail: `שיעור רווח ${profitMargin}%` },
                  { cat: "חייבים (AR)", val: data.receivables, detail: `${fmt(data.receivablesCount)} חשבוניות פתוחות` },
                  { cat: "זכאים (AP)", val: data.payables, detail: `${fmt(data.payablesCount)} חשבוניות פתוחות` },
                  { cat: "חבות מיסים", val: data.taxLiabilities, detail: "חבויות מס שטרם שולמו" },
                ].map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{row.cat}</td>
                    <td className={`px-4 py-2 font-bold ${Number(row.val) >= 0 ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(row.val)}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">רשומות קשורות</h3>
          <RelatedRecords entityType="financial-reports" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">היסטוריה</h3>
          <ActivityLog entityType="financial-reports" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
