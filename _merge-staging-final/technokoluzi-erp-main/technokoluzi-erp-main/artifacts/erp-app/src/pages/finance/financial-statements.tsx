import { useState, useEffect } from "react";
import {
  Scale, FileText, TrendingUp, BarChart3, Plus, Edit2, Trash2, X, Save, Lock,
  DollarSign, Percent, ArrowUpDown, CheckCircle2, AlertTriangle, PieChart, Calculator
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : [];
const fmtCurrency = (v: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(v || 0));
const fmtPct = (v: any) => `${Number(v || 0).toFixed(1)}%`;

const catLabelsBS: Record<string, string> = {
  current_asset: "נכסים שוטפים",
  fixed_asset: "נכסים קבועים",
  current_liability: "התחייבויות שוטפות",
  long_term_liability: "התחייבויות לזמן ארוך",
  equity: "הון עצמי",
};

const catLabelsIS: Record<string, string> = {
  revenue: "הכנסות",
  cost_of_goods: "עלות מכר",
  operating_expense: "הוצאות תפעוליות",
  financial_expense: "הוצאות מימון",
  tax: "מסים",
};

const periodStatusMap: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-green-500/20 text-green-400" },
  closing: { label: "בסגירה", color: "bg-yellow-500/20 text-yellow-400" },
  closed: { label: "סגור", color: "bg-gray-500/20 text-gray-400" },
};

function RatioCard({ label, value, suffix = "", color = "text-cyan-400", icon: Icon = Calculator }: { label: string; value: number; suffix?: string; color?: string; icon?: any }) {
  return (
    <div className="bg-[#0d0d1a] rounded-xl p-4 border border-white/5">
      <div className="flex items-center gap-2 mb-2"><Icon className={`w-4 h-4 ${color}`} /><span className="text-xs text-gray-400">{label}</span></div>
      <div className={`text-2xl font-bold ${color}`}>{Number(value || 0).toFixed(2)}{suffix}</div>
    </div>
  );
}

export default function FinancialStatementsPage() {
  const [tab, setTab] = useState<"dashboard" | "balance" | "income" | "cashflow" | "ratios" | "periods">("dashboard");
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [incomeStatement, setIncomeStatement] = useState<any>(null);
  const [cashflow, setCashflow] = useState<any>(null);
  const [ratios, setRatios] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [bsItems, setBsItems] = useState<any[]>([]);
  const [isItems, setIsItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"period" | "bs" | "is">("period");
  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, dash] = await Promise.all([
        authFetch(`${API}/financial-periods`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/financial-statements/dashboard`).then(r => r.json()).catch(() => null),
      ]);
      setPeriods(safeArray(p)); setDashboard(dash);
      if (safeArray(p).length && !selectedPeriod) setSelectedPeriod(p[0].period);
    } catch {}
    setLoading(false);
  };

  const loadReports = async () => {
    if (!selectedPeriod) return;
    try {
      const [bs, is_, cf, rt] = await Promise.all([
        authFetch(`${API}/financial-statements/balance-sheet/${selectedPeriod}`).then(r => r.json()).catch(() => null),
        authFetch(`${API}/financial-statements/income-statement/${selectedPeriod}`).then(r => r.json()).catch(() => null),
        authFetch(`${API}/financial-statements/cashflow/${selectedPeriod}`).then(r => r.json()).catch(() => null),
        authFetch(`${API}/financial-statements/ratios/${selectedPeriod}`).then(r => r.json()).catch(() => null),
      ]);
      setBalanceSheet(bs); setIncomeStatement(is_); setCashflow(cf); setRatios(rt);
    } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadReports(); }, [selectedPeriod]);

  const openForm = (type: "period" | "bs" | "is", item?: any) => {
    setFormType(type); setForm(item ? { ...item } : {}); setEditing(item || null); setShowForm(true);
  };

  const saveForm = async () => {
    setSaving(true);
    try {
      const endpoints: Record<string, string> = { period: "financial-periods", bs: "balance-sheet-items", is: "income-statement-items" };
      const url = `${API}/${endpoints[formType]}${editing ? `/${editing.id}` : ""}`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setForm({}); setEditing(null); load(); loadReports();
    } catch {}
    setSaving(false);
  };

  const del = async (type: string, id: number) => {
    const endpoints: Record<string, string> = { period: "financial-periods", bs: "balance-sheet-items", is: "income-statement-items" };
    await authFetch(`${API}/${endpoints[type]}/${id}`, { method: "DELETE" });
    load(); loadReports();
  };

  const closePeriod = async (periodId: number) => {
    await authFetch(`${API}/financial-statements/close-period/${periodId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ closed_by: "admin" }) });
    load();
  };

  const tabs = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "balance", label: "מאזן", icon: Scale },
    { key: "income", label: "דוח רווח והפסד", icon: FileText },
    { key: "cashflow", label: "תזרים מזומנים", icon: DollarSign },
    { key: "ratios", label: "יחסים פיננסיים", icon: Percent },
    { key: "periods", label: "ניהול תקופות", icon: Lock },
  ];

  function SectionTable({ title, items, total, color }: { title: string; items: any[]; total: number; color: string }) {
    return (
      <div className="mb-4">
        <h3 className={`text-sm font-semibold ${color} mb-2`}>{title}</h3>
        {safeArray(items).map((it: any, i: number) => (
          <div key={i} className="flex justify-between items-center py-1.5 px-3 hover:bg-white/5 rounded text-sm">
            <div>
              <span className="text-white">{it.item_name}</span>
              {it.subcategory && <span className="text-gray-500 text-xs mr-2">({it.subcategory})</span>}
            </div>
            <span className="text-white font-mono">{fmtCurrency(it.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between items-center py-2 px-3 border-t border-white/10 font-semibold text-sm">
          <span className={color}>סה"כ {title}</span>
          <span className={`${color} font-mono`}>{fmtCurrency(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Scale className="w-7 h-7 text-emerald-400" /> מאזן ודוחות כספיים</h1>
          <p className="text-sm text-muted-foreground mt-1">מאזן, דוח רווח והפסד, תזרים מזומנים ויחסים פיננסיים</p>
        </div>
        {periods.length > 0 && (
          <select className="bg-[#1a1a2e] border border-white/10 rounded-lg px-4 py-2 text-sm text-white" value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
            {periods.map(p => <option key={p.id} value={p.period}>{p.period}</option>)}
          </select>
        )}
      </div>

      <div className="flex gap-1 bg-[#1a1a2e] rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-white"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-20 text-gray-400">טוען נתונים...</div>}

      {/* DASHBOARD */}
      {!loading && tab === "dashboard" && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "תקופות", value: dashboard.counts?.total_periods || 0, icon: FileText, color: "text-cyan-400" },
              { label: "פתוחות", value: dashboard.counts?.open_periods || 0, icon: Lock, color: "text-green-400" },
              { label: "סגורות", value: dashboard.counts?.closed_periods || 0, icon: CheckCircle2, color: "text-gray-400" },
              { label: "פריטים", value: Number(dashboard.counts?.bs_items || 0) + Number(dashboard.counts?.is_items || 0), icon: BarChart3, color: "text-emerald-400" },
            ].map((s, i) => (
              <Card key={i} className="bg-[#1a1a2e] border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">{s.label}</span><s.icon className={`w-5 h-5 ${s.color}`} /></div>
                  <div className="text-2xl font-bold text-white">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          {dashboard.latestSummary && (
            <Card className="bg-[#1a1a2e] border-white/10">
              <CardHeader><CardTitle className="text-white text-lg">סיכום תקופה {dashboard.latestSummary.period}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                  {[
                    { label: "סה\"כ נכסים", value: fmtCurrency(dashboard.latestSummary.totalAssets), color: "text-cyan-400" },
                    { label: "סה\"כ התחייבויות", value: fmtCurrency(dashboard.latestSummary.totalLiabilities), color: "text-red-400" },
                    { label: "הון עצמי", value: fmtCurrency(dashboard.latestSummary.equity), color: "text-emerald-400" },
                    { label: "הכנסות", value: fmtCurrency(dashboard.latestSummary.revenue), color: "text-blue-400" },
                    { label: "רווח נקי", value: fmtCurrency(dashboard.latestSummary.netProfit), color: dashboard.latestSummary.netProfit >= 0 ? "text-green-400" : "text-red-400" },
                  ].map((s, i) => (
                    <div key={i}>
                      <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* BALANCE SHEET */}
      {!loading && tab === "balance" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { const p = periods.find((p: any) => p.period === selectedPeriod); openForm("bs", null); setForm({ period_id: p?.id }); }} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף פריט</button>
          </div>
          {balanceSheet ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-[#1a1a2e] border-white/10">
                <CardHeader><CardTitle className="text-cyan-400 text-lg">נכסים</CardTitle></CardHeader>
                <CardContent>
                  <SectionTable title="נכסים שוטפים" items={balanceSheet.assets?.current || []} total={safeArray(balanceSheet.assets?.current).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)} color="text-cyan-400" />
                  <SectionTable title="נכסים קבועים" items={balanceSheet.assets?.fixed || []} total={safeArray(balanceSheet.assets?.fixed).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)} color="text-blue-400" />
                  <div className="flex justify-between py-3 px-3 border-t-2 border-cyan-500/30 font-bold text-lg">
                    <span className="text-cyan-400">סה"כ נכסים</span>
                    <span className="text-cyan-400 font-mono">{fmtCurrency(balanceSheet.assets?.totalAssets)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#1a1a2e] border-white/10">
                <CardHeader><CardTitle className="text-red-400 text-lg">התחייבויות והון עצמי</CardTitle></CardHeader>
                <CardContent>
                  <SectionTable title="התחייבויות שוטפות" items={balanceSheet.liabilities?.current || []} total={safeArray(balanceSheet.liabilities?.current).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)} color="text-red-400" />
                  <SectionTable title="התחייבויות לטווח ארוך" items={balanceSheet.liabilities?.longTerm || []} total={safeArray(balanceSheet.liabilities?.longTerm).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)} color="text-orange-400" />
                  <SectionTable title="הון עצמי" items={balanceSheet.equity || []} total={Number(balanceSheet.totalEquity || 0)} color="text-emerald-400" />
                  <div className="flex justify-between py-3 px-3 border-t-2 border-red-500/30 font-bold text-lg">
                    <span className="text-red-400">סה"כ התחייבויות והון</span>
                    <span className="text-red-400 font-mono">{fmtCurrency(balanceSheet.totalLiabilitiesAndEquity)}</span>
                  </div>
                  {balanceSheet.isBalanced !== undefined && (
                    <div className={`mt-2 flex items-center gap-2 text-sm ${balanceSheet.isBalanced ? "text-green-400" : "text-red-400"}`}>
                      {balanceSheet.isBalanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      {balanceSheet.isBalanced ? "המאזן מאוזן" : "המאזן אינו מאוזן!"}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : <p className="text-center text-gray-500 py-8">בחר תקופה לצפייה במאזן</p>}
        </div>
      )}

      {/* INCOME STATEMENT */}
      {!loading && tab === "income" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { const p = periods.find((p: any) => p.period === selectedPeriod); openForm("is", null); setForm({ period_id: p?.id }); }} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף פריט</button>
          </div>
          {incomeStatement ? (
            <Card className="bg-[#1a1a2e] border-white/10">
              <CardHeader><CardTitle className="text-white text-lg">דוח רווח והפסד - {selectedPeriod}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <SectionTable title="הכנסות" items={incomeStatement.revenue || []} total={Number(incomeStatement.totalRevenue || 0)} color="text-green-400" />
                <SectionTable title="עלות מכר" items={incomeStatement.costOfGoods || []} total={Number(incomeStatement.totalCOGS || 0)} color="text-red-400" />
                <div className="flex justify-between py-2 px-3 bg-emerald-500/10 rounded-lg font-semibold"><span className="text-emerald-400">רווח גולמי ({incomeStatement.grossMargin}%)</span><span className="text-emerald-400 font-mono">{fmtCurrency(incomeStatement.grossProfit)}</span></div>
                <SectionTable title="הוצאות תפעוליות" items={incomeStatement.operatingExpenses || []} total={Number(incomeStatement.totalOpex || 0)} color="text-orange-400" />
                <div className="flex justify-between py-2 px-3 bg-blue-500/10 rounded-lg font-semibold"><span className="text-blue-400">רווח תפעולי ({incomeStatement.operatingMargin}%)</span><span className="text-blue-400 font-mono">{fmtCurrency(incomeStatement.operatingProfit)}</span></div>
                <SectionTable title="הוצאות מימון" items={incomeStatement.financialExpenses || []} total={Number(incomeStatement.totalFinancial || 0)} color="text-purple-400" />
                <div className="flex justify-between py-2 px-3 bg-yellow-500/10 rounded-lg font-semibold"><span className="text-yellow-400">רווח לפני מס</span><span className="text-yellow-400 font-mono">{fmtCurrency(incomeStatement.profitBeforeTax)}</span></div>
                <SectionTable title="מסים" items={incomeStatement.taxes || []} total={Number(incomeStatement.totalTax || 0)} color="text-gray-400" />
                <div className="flex justify-between py-3 px-3 border-t-2 border-emerald-500/30 font-bold text-lg">
                  <span className={Number(incomeStatement.netProfit || 0) >= 0 ? "text-green-400" : "text-red-400"}>רווח נקי ({incomeStatement.netMargin}%)</span>
                  <span className={`font-mono ${Number(incomeStatement.netProfit || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtCurrency(incomeStatement.netProfit)}</span>
                </div>
              </CardContent>
            </Card>
          ) : <p className="text-center text-gray-500 py-8">בחר תקופה לצפייה בדוח רוה"פ</p>}
        </div>
      )}

      {/* CASHFLOW */}
      {!loading && tab === "cashflow" && (
        <div className="space-y-4">
          {cashflow ? (
            <Card className="bg-[#1a1a2e] border-white/10">
              <CardHeader><CardTitle className="text-white text-lg">תזרים מזומנים - {selectedPeriod}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { title: "פעילות שוטפת", items: [{ l: "רווח נקי", v: cashflow.operating?.netProfit }, { l: "פחת", v: cashflow.operating?.depreciation }], total: cashflow.operating?.total, color: "text-green-400" },
                  { title: "פעילות השקעה", items: [{ l: "הוצאות הון", v: cashflow.investing?.capitalExpenditure }], total: cashflow.investing?.total, color: "text-blue-400" },
                  { title: "פעילות מימון", items: [{ l: "תשלומי חוב", v: cashflow.financing?.debtPayments }], total: cashflow.financing?.total, color: "text-purple-400" },
                ].map((s, i) => (
                  <div key={i} className="space-y-2">
                    <h3 className={`text-sm font-semibold ${s.color}`}>{s.title}</h3>
                    {s.items.map((it, j) => (
                      <div key={j} className="flex justify-between px-3 py-1 text-sm"><span className="text-gray-400">{it.l}</span><span className="text-white font-mono">{fmtCurrency(it.v)}</span></div>
                    ))}
                    <div className="flex justify-between px-3 py-2 border-t border-white/10 font-semibold text-sm"><span className={s.color}>סה"כ</span><span className={`${s.color} font-mono`}>{fmtCurrency(s.total)}</span></div>
                  </div>
                ))}
                <div className="flex justify-between py-3 px-3 border-t-2 border-emerald-500/30 font-bold text-lg">
                  <span className={Number(cashflow.netCashFlow || 0) >= 0 ? "text-green-400" : "text-red-400"}>תזרים נקי</span>
                  <span className={`font-mono ${Number(cashflow.netCashFlow || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtCurrency(cashflow.netCashFlow)}</span>
                </div>
              </CardContent>
            </Card>
          ) : <p className="text-center text-gray-500 py-8">בחר תקופה לצפייה בתזרים</p>}
        </div>
      )}

      {/* RATIOS */}
      {!loading && tab === "ratios" && (
        <div className="space-y-4">
          {ratios?.ratios ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <RatioCard label="יחס שוטף" value={ratios.ratios.currentRatio} icon={Scale} color="text-cyan-400" />
              <RatioCard label="יחס מהיר" value={ratios.ratios.quickRatio} icon={TrendingUp} color="text-blue-400" />
              <RatioCard label="חוב/הון" value={ratios.ratios.debtToEquity} icon={ArrowUpDown} color="text-orange-400" />
              <RatioCard label="תשואה על הון (ROE)" value={ratios.ratios.roe} suffix="%" icon={Percent} color="text-emerald-400" />
              <RatioCard label="תשואה על נכסים (ROA)" value={ratios.ratios.roa} suffix="%" icon={PieChart} color="text-purple-400" />
              <RatioCard label="שולי רווח גולמי" value={ratios.ratios.grossMargin} suffix="%" icon={DollarSign} color="text-green-400" />
              <RatioCard label="שולי רווח נקי" value={ratios.ratios.netMargin} suffix="%" icon={Calculator} color={ratios.ratios.netMargin >= 0 ? "text-green-400" : "text-red-400"} />
              <RatioCard label="מחזור נכסים" value={ratios.ratios.assetTurnover} icon={BarChart3} color="text-yellow-400" />
            </div>
          ) : <p className="text-center text-gray-500 py-8">בחר תקופה לצפייה ביחסים פיננסיים</p>}
        </div>
      )}

      {/* PERIODS */}
      {!loading && tab === "periods" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => openForm("period")} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף תקופה</button>
          </div>
          <Card className="bg-[#1a1a2e] border-white/10">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-gray-400">
                  <th className="p-3 text-right">תקופה</th><th className="p-3 text-right">תחילה</th><th className="p-3 text-right">סיום</th><th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">נסגר ע"י</th><th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {periods.map(p => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white font-semibold">{p.period}</td>
                      <td className="p-3 text-gray-400">{new Date(p.start_date).toLocaleDateString("he-IL")}</td>
                      <td className="p-3 text-gray-400">{new Date(p.end_date).toLocaleDateString("he-IL")}</td>
                      <td className="p-3"><Badge className={periodStatusMap[p.status]?.color || ""}>{periodStatusMap[p.status]?.label || p.status}</Badge></td>
                      <td className="p-3 text-gray-400">{p.closed_by || "—"}</td>
                      <td className="p-3 flex gap-1">
                        {p.status === "open" && <button onClick={() => closePeriod(p.id)} className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded hover:bg-yellow-600/30"><Lock className="w-3 h-3 inline mr-1" />סגור</button>}
                        <button onClick={() => openForm("period", p)} className="p-1 text-gray-400 hover:text-cyan-400"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => del("period", p.id)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {periods.length === 0 && <p className="text-center text-gray-500 py-8">אין תקופות מוגדרות</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-lg p-6 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">{editing ? "עריכה" : "הוספה"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {formType === "period" && (
              <div className="space-y-3">
                <div><label className="text-xs text-gray-400">תקופה (לדוגמה: 2026-Q1)</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.period || ""} onChange={e => setForm({ ...form, period: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400">תאריך התחלה</label><input type="date" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.start_date || ""} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                  <div><label className="text-xs text-gray-400">תאריך סיום</label><input type="date" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.end_date || ""} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
                </div>
              </div>
            )}

            {formType === "bs" && (
              <div className="space-y-3">
                <div><label className="text-xs text-gray-400">תקופה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.period_id || ""} onChange={e => setForm({ ...form, period_id: Number(e.target.value) })}><option value="">בחר...</option>{periods.map(p => <option key={p.id} value={p.id}>{p.period}</option>)}</select></div>
                <div><label className="text-xs text-gray-400">קטגוריה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}><option value="">בחר...</option>{Object.entries(catLabelsBS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-gray-400">תת-קטגוריה</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.subcategory || ""} onChange={e => setForm({ ...form, subcategory: e.target.value })} /></div>
                <div><label className="text-xs text-gray-400">שם פריט</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.item_name || ""} onChange={e => setForm({ ...form, item_name: e.target.value })} /></div>
                <div><label className="text-xs text-gray-400">סכום</label><input type="number" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              </div>
            )}

            {formType === "is" && (
              <div className="space-y-3">
                <div><label className="text-xs text-gray-400">תקופה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.period_id || ""} onChange={e => setForm({ ...form, period_id: Number(e.target.value) })}><option value="">בחר...</option>{periods.map(p => <option key={p.id} value={p.id}>{p.period}</option>)}</select></div>
                <div><label className="text-xs text-gray-400">קטגוריה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}><option value="">בחר...</option>{Object.entries(catLabelsIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-gray-400">שם פריט</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.item_name || ""} onChange={e => setForm({ ...form, item_name: e.target.value })} /></div>
                <div><label className="text-xs text-gray-400">סכום</label><input type="number" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              </div>
            )}

            <button onClick={saveForm} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
