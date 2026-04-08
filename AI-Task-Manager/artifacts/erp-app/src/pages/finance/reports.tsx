import { useState, useEffect, useMemo } from "react";
import {
  BarChart3, FileText, TrendingUp, TrendingDown, Scale, Wallet,
  AlertTriangle, DollarSign, Printer,
  Building2, CheckCircle2, Search, BookOpen
} from "lucide-react";
import { motion } from "framer-motion";
import { printPage } from "@/lib/print-utils";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtC = (v: any) => `₪${fmt(v)}`;

const tabs = [
  { id: "overview", label: "סקירה כללית", icon: BarChart3 },
  { id: "balance-sheet", label: "מאזן", icon: Scale },
  { id: "profit-loss", label: "רווח והפסד", icon: TrendingUp },
  { id: "trial-balance", label: "מאזן בוחן", icon: BookOpen },
  { id: "cash-flow", label: "דוח תזרים", icon: Wallet },
];

const accountTypeMap: Record<string, string> = {
  asset: "נכסים", liability: "התחייבויות", equity: "הון עצמי",
  revenue: "הכנסות", expense: "הוצאות"
};
const accountTypeColor: Record<string, string> = {
  asset: "text-blue-600", liability: "text-red-600", equity: "text-purple-600",
  revenue: "text-green-600", expense: "text-orange-600"
};

export default function FinanceReportsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [summary, setSummary] = useState<any>({});
  const [balanceSheet, setBalanceSheet] = useState<any>({});
  const [profitLoss, setProfitLoss] = useState<any>({});
  const [trialBalance, setTrialBalance] = useState<any>({});
  const [cashFlow, setCashFlow] = useState<any>({});
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0,10));
  const [tbSearch, setTbSearch] = useState("");
  const [tbFilter, setTbFilter] = useState("all");
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const safeFetch = (url: string, setter: (d: any) => void) => {
    authFetch(url, { headers })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(d => setter(d || {}))
      .catch(() => setter({}));
  };

  const load = () => {
    safeFetch(`${API}/finance/reports/summary`, setSummary);
    safeFetch(`${API}/finance/reports/balance-sheet`, setBalanceSheet);
    safeFetch(`${API}/finance/reports/profit-loss?from=${dateFrom}&to=${dateTo}`, setProfitLoss);
    safeFetch(`${API}/finance/trial-balance`, setTrialBalance);
    safeFetch(`${API}/finance/reports/cash-flow`, setCashFlow);
  };
  useEffect(load, [dateFrom, dateTo]);

  const tbAccounts = useMemo(() => {
    const accs = safeArray(trialBalance.accounts);
    return accs.filter((a: any) =>
      (tbFilter === "all" || a.account_type === tbFilter) &&
      (!tbSearch || a.account_name?.includes(tbSearch) || a.account_number?.includes(tbSearch))
    );
  }, [trialBalance.accounts, tbSearch, tbFilter]);

  const netWorth = Number(summary.totalAssets || 0) - Number(summary.totalLiabilities || 0);
  const grossProfit = Number(profitLoss.revenue || 0) - Number(profitLoss.costs || 0);
  const profitMargin = Number(profitLoss.revenue || 0) > 0 ? (grossProfit / Number(profitLoss.revenue) * 100).toFixed(1) : "0";

  const overviewKpis = [
    { label: "סה\"כ נכסים", value: fmtC(summary.totalAssets), icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "סה\"כ התחייבויות", value: fmtC(summary.totalLiabilities), icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
    { label: "הון עצמי", value: fmtC(summary.totalEquity), icon: Scale, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "שווי נקי", value: fmtC(netWorth), icon: DollarSign, color: netWorth >= 0 ? "text-green-600" : "text-red-600", bg: netWorth >= 0 ? "bg-green-50" : "bg-red-50" },
    { label: "יתרת בנק", value: fmtC(summary.bankBalance), icon: Wallet, color: "text-cyan-600", bg: "bg-cyan-50" },
    { label: "חובות לקוחות", value: fmtC(summary.receivables), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "חובות ספקים", value: fmtC(summary.payables), icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "חובות מס", value: fmtC(summary.taxLiabilities), icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><BarChart3 className="text-violet-600" /> דוחות כספיים</h1>
          <p className="text-muted-foreground mt-1">מאזן, רווח והפסד, מאזן בוחן, דוח תזרים מזומנים</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-1.5">
            <span className="text-sm text-muted-foreground">מ:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border-0 text-sm" />
            <span className="text-sm text-muted-foreground">עד:</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border-0 text-sm" />
          </div>
          <button onClick={() => printPage("דוחות כספיים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm">
            <Printer size={16} /> הדפסה
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? "bg-card shadow-sm text-violet-700" : "text-muted-foreground hover:text-foreground"}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {overviewKpis.map((kpi, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`${kpi.bg} rounded-xl shadow-sm border p-3`}>
                <kpi.icon className={`${kpi.color} mb-1`} size={20} />
                <div className="text-lg font-bold">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold mb-4 flex items-center gap-2"><Scale size={18} className="text-blue-600" /> סיכום מאזן</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span>נכסים</span>
                  <span className="font-bold text-blue-700">{fmtC(summary.totalAssets)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span>התחייבויות</span>
                  <span className="font-bold text-red-700">{fmtC(summary.totalLiabilities)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                  <span>הון עצמי</span>
                  <span className="font-bold text-purple-700">{fmtC(summary.totalEquity)}</span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">שווי נקי</span>
                    <span className={`text-xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtC(netWorth)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-green-600" /> סיכום רווח והפסד</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span>הכנסות</span>
                  <span className="font-bold text-green-700">{fmtC(profitLoss.revenue)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span>עלויות/הוצאות</span>
                  <span className="font-bold text-red-700">{fmtC(profitLoss.costs)}</span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">רווח גולמי</span>
                    <span className={`text-xl font-bold ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtC(grossProfit)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">שולי רווח</span>
                    <span className={`font-bold ${Number(profitMargin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profitMargin}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2"><Wallet size={18} className="text-cyan-600" /> נזילות</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>מזומן בבנק</span><span className="font-bold text-cyan-600">{fmtC(cashFlow.currentCash)}</span></div>
                <div className="flex justify-between"><span>צפי קבלות (30 יום)</span><span className="font-bold text-green-600">+{fmtC(cashFlow.upcomingReceivables)}</span></div>
                <div className="flex justify-between"><span>צפי תשלומים (30 יום)</span><span className="font-bold text-red-600">-{fmtC(cashFlow.upcomingPayables)}</span></div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-bold">צפי מזומן 30 יום</span>
                  <span className={`font-bold ${Number(cashFlow.projectedCash || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtC(cashFlow.projectedCash)}</span>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2"><BookOpen size={18} className="text-indigo-600" /> פקודות יומן</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>סה"כ פקודות</span><span className="font-bold">{fmt(summary.journalEntries)}</span></div>
                <div className="flex justify-between"><span>פקודות שבוצעו</span><span className="font-bold text-green-600">{fmt(summary.postedEntries)}</span></div>
                <div className="flex justify-between"><span>חשבונות פעילים</span><span className="font-bold text-blue-600">{fmt(summary.accountCount)}</span></div>
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold mb-3 flex items-center gap-2"><CheckCircle2 size={18} className="text-green-600" /> מאזן בוחן</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>סה"כ חיובים</span><span className="font-bold text-blue-600">{fmtC(trialBalance.totalDebit)}</span></div>
                <div className="flex justify-between"><span>סה"כ זיכויים</span><span className="font-bold text-green-600">{fmtC(trialBalance.totalCredit)}</span></div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-bold">הפרש</span>
                  <span className={`font-bold ${trialBalance.balanced ? 'text-green-600' : 'text-red-600'}`}>
                    {trialBalance.balanced ? '✓ מאוזן' : `₪${fmt(trialBalance.difference)}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "balance-sheet" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><Scale size={20} className="text-blue-600" /> דוח מאזן</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <div className="flex items-center gap-2 mb-3"><Building2 className="text-blue-600" size={20} /><span className="font-bold text-blue-700">נכסים</span></div>
              <div className="text-xl sm:text-3xl font-bold text-blue-700 mb-3">{fmtC(balanceSheet.assets?.total)}</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-card rounded"><span>יתרת בנק</span><span className="font-bold">{fmtC(balanceSheet.assets?.bankBalance)}</span></div>
                <div className="flex justify-between p-2 bg-card rounded"><span>חובות לקוחות</span><span className="font-bold">{fmtC(balanceSheet.assets?.receivables)}</span></div>
                {safeArray(balanceSheet.assets?.items).map((a: any) => (
                  <div key={a.id} className="flex justify-between p-2 bg-card rounded">
                    <span className="truncate">{a.account_name}</span><span className="font-bold">{fmtC(a.balance)}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-red-50 rounded-xl border border-red-200 p-4">
              <div className="flex items-center gap-2 mb-3"><AlertTriangle className="text-red-600" size={20} /><span className="font-bold text-red-700">התחייבויות</span></div>
              <div className="text-xl sm:text-3xl font-bold text-red-700 mb-3">{fmtC(balanceSheet.liabilities?.total)}</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-card rounded"><span>חובות לספקים</span><span className="font-bold">{fmtC(balanceSheet.liabilities?.payables)}</span></div>
                {safeArray(balanceSheet.liabilities?.items).map((a: any) => (
                  <div key={a.id} className="flex justify-between p-2 bg-card rounded">
                    <span className="truncate">{a.account_name}</span><span className="font-bold">{fmtC(a.balance)}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-purple-50 rounded-xl border border-purple-200 p-4">
              <div className="flex items-center gap-2 mb-3"><Scale className="text-purple-600" size={20} /><span className="font-bold text-purple-700">הון עצמי</span></div>
              <div className="text-xl sm:text-3xl font-bold text-purple-700 mb-3">{fmtC(balanceSheet.equity?.total)}</div>
              <div className="space-y-2 text-sm">
                {safeArray(balanceSheet.equity?.items).map((a: any) => (
                  <div key={a.id} className="flex justify-between p-2 bg-card rounded">
                    <span className="truncate">{a.account_name}</span><span className="font-bold">{fmtC(a.balance)}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="bg-card rounded-xl shadow-sm border p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold">שווי נקי (נכסים - התחייבויות)</span>
              <span className={`text-lg sm:text-2xl font-bold ${Number(balanceSheet.netWorth || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmtC(balanceSheet.netWorth)}
              </span>
            </div>
            <div className="mt-3 bg-muted/50 rounded-full h-4 overflow-hidden">
              {Number(balanceSheet.assets?.total || 0) > 0 && (
                <div className="h-4 bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (Number(balanceSheet.assets?.total || 0) / (Number(balanceSheet.assets?.total || 0) + Number(balanceSheet.liabilities?.total || 0))) * 100)}%` }} />
              )}
            </div>
            <div className="flex justify-between text-xs mt-1 text-muted-foreground">
              <span>נכסים: {fmtC(balanceSheet.assets?.total)}</span>
              <span>התחייבויות: {fmtC(balanceSheet.liabilities?.total)}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "profit-loss" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><TrendingUp size={20} className="text-green-600" /> דוח רווח והפסד</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
              <TrendingUp className="text-green-600 mx-auto mb-2" size={24} />
              <div className="text-lg sm:text-2xl font-bold text-green-700">{fmtC(profitLoss.revenue)}</div>
              <div className="text-sm text-green-600">הכנסות</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
              <TrendingDown className="text-red-600 mx-auto mb-2" size={24} />
              <div className="text-lg sm:text-2xl font-bold text-red-700">{fmtC(profitLoss.costs)}</div>
              <div className="text-sm text-red-600">הוצאות</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${grossProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} rounded-xl border p-4 text-center`}>
              <DollarSign className={`${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} mx-auto mb-2`} size={24} />
              <div className={`text-lg sm:text-2xl font-bold ${grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtC(grossProfit)}</div>
              <div className={`text-sm ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>רווח גולמי</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-violet-50 rounded-xl border border-violet-200 p-4 text-center">
              <BarChart3 className="text-violet-600 mx-auto mb-2" size={24} />
              <div className="text-lg sm:text-2xl font-bold text-violet-700">{profitMargin}%</div>
              <div className="text-sm text-violet-600">שולי רווח</div>
            </motion.div>
          </div>

          {safeArray(profitLoss.expensesByCategory).length > 0 && (
            <div className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold mb-4">פירוט הוצאות לפי קטגוריה</h3>
              <div className="space-y-2">
                {safeArray(profitLoss.expensesByCategory).map((cat: any, i: number) => {
                  const total = safeArray(profitLoss.expensesByCategory).reduce((s: number, c: any) => s + Number(c.total || 0), 0);
                  const pct = total > 0 ? (Number(cat.total) / total * 100) : 0;
                  const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-red-500', 'bg-purple-500', 'bg-cyan-500', 'bg-pink-500', 'bg-yellow-500'];
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-32 text-sm truncate">{cat.category || "אחר"}</div>
                      <div className="flex-1 bg-muted/50 rounded-full h-5">
                        <div className={`${colors[i % colors.length]} h-5 rounded-full flex items-center justify-end px-2`}
                          style={{ width: `${Math.max(5, pct)}%` }}>
                          <span className="text-[10px] text-foreground font-bold">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="w-24 text-left font-bold text-sm">{fmtC(cat.total)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {safeArray(profitLoss.projectProfitability).length > 0 && (
            <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
              <div className="p-4 border-b"><h3 className="font-bold">רווחיות פרויקטים</h3></div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-3 text-right">פרויקט</th>
                    <th className="px-4 py-3 text-right">הכנסות</th>
                    <th className="px-4 py-3 text-right">עלויות</th>
                    <th className="px-4 py-3 text-right">רווח</th>
                    <th className="px-4 py-3 text-right">מרווח</th>
                  </tr>
                </thead>
                <tbody>
                  {safeArray(profitLoss.projectProfitability).map((p: any, i: number) => {
                    const profit = Number(p.actual_revenue || 0) - Number(p.actual_cost || 0);
                    return (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{p.project_name}</td>
                        <td className="px-4 py-3 text-green-600 font-bold">{fmtC(p.actual_revenue)}</td>
                        <td className="px-4 py-3 text-red-600">{fmtC(p.actual_cost)}</td>
                        <td className={`px-4 py-3 font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtC(profit)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${Number(p.margin) >= 20 ? 'bg-green-100 text-green-700' : Number(p.margin) >= 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {p.margin}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "trial-balance" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen size={20} className="text-indigo-600" /> מאזן בוחן</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
              <div className="text-sm text-blue-600 mb-1">סה"כ חובה (Debit)</div>
              <div className="text-lg sm:text-2xl font-bold text-blue-700">{fmtC(trialBalance.totalDebit)}</div>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
              <div className="text-sm text-green-600 mb-1">סה"כ זכות (Credit)</div>
              <div className="text-lg sm:text-2xl font-bold text-green-700">{fmtC(trialBalance.totalCredit)}</div>
            </div>
            <div className={`${trialBalance.balanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} rounded-xl border p-4 text-center`}>
              <div className={`text-sm ${trialBalance.balanced ? 'text-green-600' : 'text-red-600'} mb-1`}>הפרש</div>
              <div className={`text-lg sm:text-2xl font-bold ${trialBalance.balanced ? 'text-green-700' : 'text-red-700'}`}>
                {trialBalance.balanced ? '✓ מאוזן' : fmtC(trialBalance.difference)}
              </div>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
              <input value={tbSearch} onChange={e => setTbSearch(e.target.value)} placeholder="חיפוש חשבון..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
            </div>
            <select value={tbFilter} onChange={e => setTbFilter(e.target.value)} className="border rounded-lg px-3 py-2">
              <option value="all">כל הסוגים</option>
              {Object.entries(accountTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="px-4 py-3 text-right">מספר חשבון</th>
                  <th className="px-4 py-3 text-right">שם חשבון</th>
                  <th className="px-4 py-3 text-right">סוג</th>
                  <th className="px-4 py-3 text-right">חשבון אב</th>
                  <th className="px-4 py-3 text-right">חובה</th>
                  <th className="px-4 py-3 text-right">זכות</th>
                  <th className="px-4 py-3 text-right">יתרה</th>
                </tr>
              </thead>
              <tbody>
                {tbAccounts.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">אין חשבונות</td></tr>
                ) : tbAccounts.map((a: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-indigo-50/30">
                    <td className="px-4 py-2 font-mono text-indigo-600 font-bold">{a.account_number}</td>
                    <td className="px-4 py-2 font-medium">{a.account_name}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${accountTypeColor[a.account_type] || ''}`}>
                        {accountTypeMap[a.account_type] || a.account_type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{a.parent_account || "-"}</td>
                    <td className="px-4 py-2 font-bold text-blue-600">{Number(a.debit_balance) > 0 ? fmtC(a.debit_balance) : '-'}</td>
                    <td className="px-4 py-2 font-bold text-green-600">{Number(a.credit_balance) > 0 ? fmtC(a.credit_balance) : '-'}</td>
                    <td className="px-4 py-2 font-bold">{fmtC(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50 font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={4}>סיכום</td>
                  <td className="px-4 py-3 text-blue-600">{fmtC(tbAccounts.reduce((s: number, a: any) => s + Number(a.debit_balance || 0), 0))}</td>
                  <td className="px-4 py-3 text-green-600">{fmtC(tbAccounts.reduce((s: number, a: any) => s + Number(a.credit_balance || 0), 0))}</td>
                  <td className="px-4 py-3">{fmtC(tbAccounts.reduce((s: number, a: any) => s + Number(a.balance || 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="text-sm text-muted-foreground">סה"כ: {tbAccounts.length} חשבונות</div>
        </div>
      )}

      {activeTab === "cash-flow" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><Wallet size={20} className="text-cyan-600" /> דוח תזרים מזומנים</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-cyan-50 rounded-xl border border-cyan-200 p-4 text-center">
              <Wallet className="text-cyan-600 mx-auto mb-2" size={24} />
              <div className="text-lg sm:text-2xl font-bold text-cyan-700">{fmtC(cashFlow.currentCash)}</div>
              <div className="text-sm text-cyan-600">מזומן נוכחי</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
              <TrendingUp className="text-green-600 mx-auto mb-2" size={24} />
              <div className="text-lg sm:text-2xl font-bold text-green-700">{fmtC(cashFlow.upcomingReceivables)}</div>
              <div className="text-sm text-green-600">צפי קבלות (30 יום)</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
              <TrendingDown className="text-red-600 mx-auto mb-2" size={24} />
              <div className="text-lg sm:text-2xl font-bold text-red-700">{fmtC(cashFlow.upcomingPayables)}</div>
              <div className="text-sm text-red-600">צפי תשלומים (30 יום)</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className={`${Number(cashFlow.projectedCash || 0) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} rounded-xl border p-4 text-center`}>
              <DollarSign className={`${Number(cashFlow.projectedCash || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'} mx-auto mb-2`} size={24} />
              <div className={`text-lg sm:text-2xl font-bold ${Number(cashFlow.projectedCash || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtC(cashFlow.projectedCash)}</div>
              <div className={`text-sm ${Number(cashFlow.projectedCash || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>צפי מזומן 30 יום</div>
            </motion.div>
          </div>

          {safeArray(cashFlow.monthlyFlow).length > 0 && (
            <div className="bg-card rounded-xl shadow-sm border p-5">
              <h3 className="font-bold mb-4">תזרים חודשי — הכנסות מול הוצאות</h3>
              <div className="flex items-end gap-3 h-48 overflow-x-auto pb-2">
                {safeArray(cashFlow.monthlyFlow).map((m: any, i: number) => {
                  const income = Number(m.income || 0);
                  const expenses = Number(m.expenses || 0);
                  const maxVal = Math.max(...safeArray(cashFlow.monthlyFlow).map((x: any) => Math.max(Number(x.income || 0), Number(x.expenses || 0))), 1);
                  const hIncome = Math.max(4, (income / maxVal) * 150);
                  const hExpenses = Math.max(4, (expenses / maxVal) * 150);
                  return (
                    <div key={i} className="flex flex-col items-center min-w-[80px]">
                      <div className="flex gap-1 items-end">
                        <div className="flex flex-col items-center">
                          <div className="text-[9px] text-green-600 mb-0.5">{fmt(income)}</div>
                          <div className="w-6 bg-green-400 rounded-t" style={{ height: `${hIncome}px` }} />
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="text-[9px] text-red-600 mb-0.5">{fmt(expenses)}</div>
                          <div className="w-6 bg-red-400 rounded-t" style={{ height: `${hExpenses}px` }} />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{m.month}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-400" /> הכנסות</span>
                <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400" /> הוצאות</span>
              </div>
            </div>
          )}

          <div className="bg-card rounded-xl shadow-sm border p-5">
            <h3 className="font-bold mb-4">סיכום תזרים</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-cyan-50 rounded-lg">
                <span className="flex items-center gap-2"><Wallet size={16} className="text-cyan-600" /> יתרת פתיחה (בנקים)</span>
                <span className="font-bold text-cyan-700">{fmtC(cashFlow.currentCash)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="flex items-center gap-2"><TrendingUp size={16} className="text-green-600" /> (+) צפי קבלות</span>
                <span className="font-bold text-green-700">+{fmtC(cashFlow.upcomingReceivables)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="flex items-center gap-2"><TrendingDown size={16} className="text-red-600" /> (-) צפי תשלומים</span>
                <span className="font-bold text-red-700">-{fmtC(cashFlow.upcomingPayables)}</span>
              </div>
              <div className="border-t-2 pt-3 flex justify-between items-center">
                <span className="font-bold text-lg">צפי סיום (30 יום)</span>
                <span className={`text-lg sm:text-2xl font-bold ${Number(cashFlow.projectedCash || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmtC(cashFlow.projectedCash)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="finance-report" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="finance-report" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
