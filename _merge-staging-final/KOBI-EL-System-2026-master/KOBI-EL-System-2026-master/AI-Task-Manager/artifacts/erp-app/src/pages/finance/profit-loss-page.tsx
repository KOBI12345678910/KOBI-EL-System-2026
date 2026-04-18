import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Calendar, ArrowLeftRight, Download, Printer, Send } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDec = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const MONTH_NAMES = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const MONTH_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

const YEAR_COLORS: Record<number, { revenue: string; expenses: string; net: string }> = {
  0: { revenue: "#22c55e", expenses: "#ef4444", net: "#3b82f6" },
  1: { revenue: "#86efac", expenses: "#fca5a5", net: "#93c5fd" },
  2: { revenue: "#4ade80", expenses: "#f87171", net: "#60a5fa" },
};

type ViewMode = "detail" | "monthly-compare" | "yearly-compare";

interface MonthData {
  month: number;
  monthName: string;
  revenue: number;
  expenses: number;
  netIncome: number;
  margin: number;
}

export default function ProfitLossPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [compareYear, setCompareYear] = useState(new Date().getFullYear() - 1);
  const [periodFrom, setPeriodFrom] = useState(1);
  const [periodTo, setPeriodTo] = useState(12);

  const [detailData, setDetailData] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<Record<number, MonthData[]>>({});
  const [loading, setLoading] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/financial-reports/profit-loss?fiscal_year=${fiscalYear}&period_from=${periodFrom}&period_to=${periodTo}`);
      const d = await res.json();
      setDetailData(d);
    } catch { setDetailData(null); }
    setLoading(false);
  };

  const loadMonthly = async (years: number[]) => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/financial-reports/profit-loss/monthly?years=${years.join(",")}`);
      const d = await res.json();
      const map: Record<number, MonthData[]> = {};
      for (const [yr, val] of Object.entries(d.years || {})) {
        map[Number(yr)] = (val as any).months;
      }
      setMonthlyData(map);
    } catch { setMonthlyData({}); }
    setLoading(false);
  };

  useEffect(() => {
    if (viewMode === "detail") loadDetail();
    else if (viewMode === "monthly-compare") loadMonthly([fiscalYear, compareYear]);
    else if (viewMode === "yearly-compare") {
      const yrs = [fiscalYear, fiscalYear - 1, fiscalYear - 2];
      loadMonthly(yrs);
    }
  }, [viewMode, fiscalYear, compareYear, periodFrom, periodTo]);

  const allItems = [...(detailData?.revenues || []).map((r: any) => ({ ...r, itemType: "הכנסה" })), ...(detailData?.expenses || []).map((e: any) => ({ ...e, itemType: "הוצאה" }))];

  const chartData = useMemo(() => {
    if (viewMode === "monthly-compare") {
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const y1 = monthlyData[fiscalYear]?.find(d => d.month === m);
        const y2 = monthlyData[compareYear]?.find(d => d.month === m);
        return {
          name: MONTH_SHORT[i],
          [`הכנסות ${fiscalYear}`]: y1?.revenue || 0,
          [`הוצאות ${fiscalYear}`]: y1?.expenses || 0,
          [`רווח ${fiscalYear}`]: y1?.netIncome || 0,
          [`הכנסות ${compareYear}`]: y2?.revenue || 0,
          [`הוצאות ${compareYear}`]: y2?.expenses || 0,
          [`רווח ${compareYear}`]: y2?.netIncome || 0,
        };
      });
    }
    if (viewMode === "yearly-compare") {
      const years = [fiscalYear, fiscalYear - 1, fiscalYear - 2];
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const row: any = { name: MONTH_SHORT[i] };
        for (const yr of years) {
          const d = monthlyData[yr]?.find(d => d.month === m);
          row[`רווח ${yr}`] = d?.netIncome || 0;
        }
        return row;
      });
    }
    return [];
  }, [monthlyData, viewMode, fiscalYear, compareYear]);

  const yearsList = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">דוח רווח והפסד</h1>
            <p className="text-sm text-muted-foreground">הכנסות, הוצאות ורווח/הפסד נקי — השוואה חודשית ושנתית</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <ExportDropdown data={allItems} headers={{ account_number: "מספר חשבון", account_name: "שם חשבון", itemType: "סוג", amount: "סכום" }} filename={"profit_loss"} />
          <button onClick={() => printPage("דוח רווח והפסד")} className="flex items-center gap-1.5 bg-slate-700 text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("דוח רווח והפסד", generateEmailBody("רווח והפסד", allItems, { account_number: "מספר", account_name: "חשבון", amount: "סכום" }))} className="flex items-center gap-1.5 bg-slate-700 text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex bg-card border border-border/50 rounded-lg overflow-hidden">
          {([
            { key: "detail" as ViewMode, label: "פירוט", icon: DollarSign },
            { key: "monthly-compare" as ViewMode, label: "חודש מול חודש", icon: Calendar },
            { key: "yearly-compare" as ViewMode, label: "שנה מול שנה", icon: ArrowLeftRight },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setViewMode(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${viewMode === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card/5"}`}>
              <tab.icon size={15} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mr-4">
          <label className="text-sm text-muted-foreground">שנה:</label>
          <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))} className="bg-card border border-border/50 rounded-lg px-3 py-1.5 text-sm">
            {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {viewMode === "monthly-compare" && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">מול שנה:</label>
            <select value={compareYear} onChange={e => setCompareYear(Number(e.target.value))} className="bg-card border border-border/50 rounded-lg px-3 py-1.5 text-sm">
              {yearsList.filter(y => y !== fiscalYear).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        {viewMode === "detail" && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">מ-חודש:</label>
              <select value={periodFrom} onChange={e => setPeriodFrom(Number(e.target.value))} className="bg-card border border-border/50 rounded-lg px-2 py-1.5 text-sm">
                {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">עד-חודש:</label>
              <select value={periodTo} onChange={e => setPeriodTo(Number(e.target.value))} className="bg-card border border-border/50 rounded-lg px-2 py-1.5 text-sm">
                {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {loading && <div className="text-center py-12 text-muted-foreground">טוען דוח...</div>}

      {!loading && viewMode === "detail" && detailData && <DetailView data={detailData} />}
      {!loading && viewMode === "monthly-compare" && <MonthlyCompareView data={monthlyData} year1={fiscalYear} year2={compareYear} chartData={chartData} />}
      {!loading && viewMode === "yearly-compare" && <YearlyCompareView data={monthlyData} years={[fiscalYear, fiscalYear - 1, fiscalYear - 2]} chartData={chartData} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="profit-loss" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="profit-loss" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}

function SummaryCards({ revenue, expenses, net, margin }: { revenue: number; expenses: number; net: number; margin: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-card border border-emerald-500/20 rounded-xl p-4">
        <div className="text-xs text-muted-foreground">סה״כ הכנסות</div>
        <div className="text-xl font-bold text-emerald-400 mt-1">₪{fmt(revenue)}</div>
      </div>
      <div className="bg-card border border-red-500/20 rounded-xl p-4">
        <div className="text-xs text-muted-foreground">סה״כ הוצאות</div>
        <div className="text-xl font-bold text-red-400 mt-1">₪{fmt(expenses)}</div>
      </div>
      <div className={`bg-card border rounded-xl p-4 ${net >= 0 ? "border-blue-500/20" : "border-red-500/20"}`}>
        <div className="text-xs text-muted-foreground">רווח/הפסד נקי</div>
        <div className={`text-xl font-bold mt-1 ${net >= 0 ? "text-blue-400" : "text-red-400"}`}>₪{fmt(net)}</div>
      </div>
      <div className="bg-card border border-purple-500/20 rounded-xl p-4">
        <div className="text-xs text-muted-foreground">שיעור רווח</div>
        <div className="text-xl font-bold text-purple-400 mt-1">{fmtDec(margin)}%</div>
      </div>
    </div>
  );
}

function DetailView({ data }: { data: any }) {
  return (
    <>
      <SummaryCards revenue={data.summary?.totalRevenue} expenses={data.summary?.totalExpenses} net={data.summary?.netIncome} margin={data.summary?.margin} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border/50 rounded-xl p-5">
          <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-1.5"><TrendingUp size={16} /> הכנסות</h3>
          {(data.revenues || []).length === 0 ? <div className="text-muted-foreground text-sm">אין חשבונות הכנסה</div> :
            <table className="w-full text-sm"><tbody>
              {(data.revenues || []).map((r: any, i: number) => (
                <tr key={i} className="border-b border-border/20">
                  <td className="py-2 font-mono text-xs text-emerald-500/70">{r.account_number}</td>
                  <td className="py-2">{r.account_name}</td>
                  <td className="py-2 text-left font-bold text-emerald-400">₪{fmt(Math.abs(r.amount))}</td>
                </tr>
              ))}
              <tr className="font-bold text-emerald-400"><td colSpan={2} className="py-3">סה״כ הכנסות</td><td className="py-3 text-left">₪{fmt(data.summary?.totalRevenue)}</td></tr>
            </tbody></table>}
        </div>

        <div className="bg-card border border-border/50 rounded-xl p-5">
          <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-1.5"><TrendingDown size={16} /> הוצאות</h3>
          {(data.expenses || []).length === 0 ? <div className="text-muted-foreground text-sm">אין חשבונות הוצאה</div> :
            <table className="w-full text-sm"><tbody>
              {(data.expenses || []).map((r: any, i: number) => (
                <tr key={i} className="border-b border-border/20">
                  <td className="py-2 font-mono text-xs text-red-500/70">{r.account_number}</td>
                  <td className="py-2">{r.account_name}</td>
                  <td className="py-2 text-left font-bold text-red-400">₪{fmt(Math.abs(r.amount))}</td>
                </tr>
              ))}
              <tr className="font-bold text-red-400"><td colSpan={2} className="py-3">סה״כ הוצאות</td><td className="py-3 text-left">₪{fmt(data.summary?.totalExpenses)}</td></tr>
            </tbody></table>}
        </div>
      </div>
    </>
  );
}

function MonthlyCompareView({ data, year1, year2, chartData }: { data: Record<number, MonthData[]>; year1: number; year2: number; chartData: any[] }) {
  const d1 = data[year1] || [];
  const d2 = data[year2] || [];
  const total1Rev = d1.reduce((s, m) => s + m.revenue, 0);
  const total1Exp = d1.reduce((s, m) => s + m.expenses, 0);
  const total2Rev = d2.reduce((s, m) => s + m.revenue, 0);
  const total2Exp = d2.reduce((s, m) => s + m.expenses, 0);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-bold text-blue-400 mb-2">{year1}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs">
            <div><span className="text-muted-foreground">הכנסות</span><div className="text-emerald-400 font-bold text-base">₪{fmt(total1Rev)}</div></div>
            <div><span className="text-muted-foreground">הוצאות</span><div className="text-red-400 font-bold text-base">₪{fmt(total1Exp)}</div></div>
            <div><span className="text-muted-foreground">רווח נקי</span><div className={`font-bold text-base ${total1Rev - total1Exp >= 0 ? "text-blue-400" : "text-red-400"}`}>₪{fmt(total1Rev - total1Exp)}</div></div>
          </div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-bold text-amber-400 mb-2">{year2}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs">
            <div><span className="text-muted-foreground">הכנסות</span><div className="text-emerald-400 font-bold text-base">₪{fmt(total2Rev)}</div></div>
            <div><span className="text-muted-foreground">הוצאות</span><div className="text-red-400 font-bold text-base">₪{fmt(total2Exp)}</div></div>
            <div><span className="text-muted-foreground">רווח נקי</span><div className={`font-bold text-base ${total2Rev - total2Exp >= 0 ? "text-blue-400" : "text-red-400"}`}>₪{fmt(total2Rev - total2Exp)}</div></div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4">רווח נקי — חודש מול חודש</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
            <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", direction: "rtl" }}
              formatter={(v: number) => [`₪${fmt(v)}`, undefined]} />
            <Legend wrapperStyle={{ direction: "rtl" }} />
            <Line type="monotone" dataKey={`רווח ${year1}`} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey={`רווח ${year2}`} stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} strokeDasharray="6 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4">הכנסות והוצאות — השוואה חודשית</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
            <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", direction: "rtl" }}
              formatter={(v: number) => [`₪${fmt(v)}`, undefined]} />
            <Legend wrapperStyle={{ direction: "rtl" }} />
            <Line type="monotone" dataKey={`הכנסות ${year1}`} stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={`הוצאות ${year1}`} stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={`הכנסות ${year2}`} stroke="#86efac" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
            <Line type="monotone" dataKey={`הוצאות ${year2}`} stroke="#fca5a5" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30">
          <h3 className="text-sm font-bold">טבלת השוואה חודשית — {year1} מול {year2}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-right">חודש</th>
                <th className="px-3 py-2.5 text-left">הכנסות {year1}</th>
                <th className="px-3 py-2.5 text-left">הוצאות {year1}</th>
                <th className="px-3 py-2.5 text-left">רווח {year1}</th>
                <th className="px-3 py-2.5 text-left">הכנסות {year2}</th>
                <th className="px-3 py-2.5 text-left">הוצאות {year2}</th>
                <th className="px-3 py-2.5 text-left">רווח {year2}</th>
                <th className="px-3 py-2.5 text-left">שינוי %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {MONTH_NAMES.map((name, i) => {
                const m1 = d1.find(d => d.month === i + 1);
                const m2 = d2.find(d => d.month === i + 1);
                const net1 = m1?.netIncome || 0;
                const net2 = m2?.netIncome || 0;
                const pctChange = net2 !== 0 ? ((net1 - net2) / Math.abs(net2) * 100) : (net1 !== 0 ? 100 : 0);
                return (
                  <tr key={i} className="hover:bg-card/[0.02]">
                    <td className="px-4 py-2 font-medium">{name}</td>
                    <td className="px-3 py-2 text-left text-emerald-400">₪{fmt(m1?.revenue)}</td>
                    <td className="px-3 py-2 text-left text-red-400">₪{fmt(m1?.expenses)}</td>
                    <td className={`px-3 py-2 text-left font-bold ${net1 >= 0 ? "text-blue-400" : "text-red-400"}`}>₪{fmt(net1)}</td>
                    <td className="px-3 py-2 text-left text-emerald-400/70">₪{fmt(m2?.revenue)}</td>
                    <td className="px-3 py-2 text-left text-red-400/70">₪{fmt(m2?.expenses)}</td>
                    <td className={`px-3 py-2 text-left font-bold ${net2 >= 0 ? "text-blue-400/70" : "text-red-400/70"}`}>₪{fmt(net2)}</td>
                    <td className={`px-3 py-2 text-left font-bold ${pctChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {pctChange >= 0 ? "+" : ""}{fmtDec(pctChange)}%
                    </td>
                  </tr>
                );
              })}
              <tr className="font-bold border-t-2 border-border/40">
                <td className="px-4 py-3">סה״כ</td>
                <td className="px-3 py-3 text-left text-emerald-400">₪{fmt(total1Rev)}</td>
                <td className="px-3 py-3 text-left text-red-400">₪{fmt(total1Exp)}</td>
                <td className={`px-3 py-3 text-left ${total1Rev - total1Exp >= 0 ? "text-blue-400" : "text-red-400"}`}>₪{fmt(total1Rev - total1Exp)}</td>
                <td className="px-3 py-3 text-left text-emerald-400/70">₪{fmt(total2Rev)}</td>
                <td className="px-3 py-3 text-left text-red-400/70">₪{fmt(total2Exp)}</td>
                <td className={`px-3 py-3 text-left ${total2Rev - total2Exp >= 0 ? "text-blue-400/70" : "text-red-400/70"}`}>₪{fmt(total2Rev - total2Exp)}</td>
                <td className="px-3 py-3 text-left">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function YearlyCompareView({ data, years, chartData }: { data: Record<number, MonthData[]>; years: number[]; chartData: any[] }) {
  const yearSummaries = years.map(yr => {
    const d = data[yr] || [];
    const totalRev = d.reduce((s, m) => s + m.revenue, 0);
    const totalExp = d.reduce((s, m) => s + m.expenses, 0);
    return { year: yr, revenue: totalRev, expenses: totalExp, net: totalRev - totalExp, margin: totalRev > 0 ? ((totalRev - totalExp) / totalRev * 100) : 0 };
  });

  const lineColors = ["#3b82f6", "#f59e0b", "#a855f7"];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {yearSummaries.map((ys, idx) => (
          <div key={ys.year} className="bg-card border border-border/50 rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3" style={{ color: lineColors[idx] }}>{ys.year}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">הכנסות</span><span className="text-emerald-400 font-bold">₪{fmt(ys.revenue)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">הוצאות</span><span className="text-red-400 font-bold">₪{fmt(ys.expenses)}</span></div>
              <div className="flex justify-between border-t border-border/30 pt-2">
                <span className="font-medium">רווח נקי</span>
                <span className={`font-bold ${ys.net >= 0 ? "text-blue-400" : "text-red-400"}`}>₪{fmt(ys.net)}</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">שיעור רווח</span><span className="text-purple-400 font-bold">{fmtDec(ys.margin)}%</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4">רווח נקי — השוואת 3 שנים</h3>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
            <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", direction: "rtl" }}
              formatter={(v: number) => [`₪${fmt(v)}`, undefined]} />
            <Legend wrapperStyle={{ direction: "rtl" }} />
            {years.map((yr, idx) => (
              <Line key={yr} type="monotone" dataKey={`רווח ${yr}`} stroke={lineColors[idx]} strokeWidth={idx === 0 ? 3 : 2}
                dot={{ r: idx === 0 ? 4 : 3 }} activeDot={{ r: 6 }}
                strokeDasharray={idx === 0 ? undefined : idx === 1 ? "6 3" : "3 3"} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30">
          <h3 className="text-sm font-bold">טבלת רווח נקי חודשי — {years.join(" / ")}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-right">חודש</th>
                {years.map(yr => (
                  <th key={yr} className="px-3 py-2.5 text-left">רווח {yr}</th>
                ))}
                <th className="px-3 py-2.5 text-left">שינוי YoY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {MONTH_NAMES.map((name, i) => {
                const vals = years.map(yr => {
                  const d = data[yr]?.find(d => d.month === i + 1);
                  return d?.netIncome || 0;
                });
                const yoyChange = vals[1] !== 0 ? ((vals[0] - vals[1]) / Math.abs(vals[1]) * 100) : (vals[0] !== 0 ? 100 : 0);
                return (
                  <tr key={i} className="hover:bg-card/[0.02]">
                    <td className="px-4 py-2 font-medium">{name}</td>
                    {vals.map((v, idx) => (
                      <td key={idx} className={`px-3 py-2 text-left font-bold ${v >= 0 ? "text-blue-400" : "text-red-400"} ${idx > 0 ? "opacity-70" : ""}`}>
                        ₪{fmt(v)}
                      </td>
                    ))}
                    <td className={`px-3 py-2 text-left font-bold ${yoyChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {yoyChange >= 0 ? "+" : ""}{fmtDec(yoyChange)}%
                    </td>
                  </tr>
                );
              })}
              <tr className="font-bold border-t-2 border-border/40">
                <td className="px-4 py-3">סה״כ שנתי</td>
                {yearSummaries.map((ys, idx) => (
                  <td key={idx} className={`px-3 py-3 text-left ${ys.net >= 0 ? "text-blue-400" : "text-red-400"} ${idx > 0 ? "opacity-70" : ""}`}>
                    ₪{fmt(ys.net)}
                  </td>
                ))}
                <td className="px-3 py-3 text-left">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
