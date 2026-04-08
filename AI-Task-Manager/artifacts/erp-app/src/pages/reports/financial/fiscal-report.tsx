import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarRange, ChevronLeft, TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authJson } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

export default function FiscalReportPage() {
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["fiscal-report", fiscalYear],
    queryFn: async () => {
      try {
        return await authJson(`${API}/reports-center/financial?period=year&year=${fiscalYear}`);
      } catch {
        return {};
      }
    },
  });

  const monthly = (data?.monthly || []).map((m: any, idx: number) => ({
    month: idx + 1,
    label: ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"][idx],
    income: Number(m.income || 0),
    expenses: Number(m.expenses || 0),
    profit: Number(m.profit || 0),
  }));

  const quarterly = QUARTERS.map((q, i) => {
    const startMonth = i * 3;
    const qMonths = monthly.slice(startMonth, startMonth + 3);
    return {
      quarter: q,
      income: qMonths.reduce((s, m) => s + m.income, 0),
      expenses: qMonths.reduce((s, m) => s + m.expenses, 0),
      profit: qMonths.reduce((s, m) => s + m.profit, 0),
    };
  });

  const totalIncome = Number(data?.totalIncome || 0);
  const totalExpenses = Number(data?.totalExpenses || 0);
  const grossProfit = Number(data?.grossProfit || 0);
  const profitMargin = Number(data?.profitMargin || 0);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports/financial" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          דוחות כספיים
        </Link>
        <span>/</span>
        <span className="text-foreground">Fiscal Report</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarRange className="w-6 h-6 text-violet-400" /> Fiscal Report — סיכום פיסקלי
          </h1>
          <p className="text-muted-foreground mt-1">סיכום שנתי ורבעוני של הביצועים הכספיים</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">שנה:</label>
          <select
            value={fiscalYear}
            onChange={e => setFiscalYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-foreground text-sm"
          >
            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <TrendingUp className="w-6 h-6 text-green-400 mb-1" />
            <p className="text-xl font-bold text-foreground">₪{fmt(totalIncome)}</p>
            <p className="text-xs text-green-400/70">סה"כ הכנסות {fiscalYear}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <TrendingDown className="w-6 h-6 text-red-400 mb-1" />
            <p className="text-xl font-bold text-foreground">₪{fmt(totalExpenses)}</p>
            <p className="text-xs text-red-400/70">סה"כ הוצאות {fiscalYear}</p>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br ${grossProfit >= 0 ? "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20" : "from-red-500/10 to-red-600/5 border-red-500/20"}`}>
          <CardContent className="p-4">
            <DollarSign className="w-6 h-6 text-emerald-400 mb-1" />
            <p className="text-xl font-bold text-foreground">₪{fmt(grossProfit)}</p>
            <p className="text-xs text-emerald-400/70">רווח גולמי</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
          <CardContent className="p-4">
            <BarChart3 className="w-6 h-6 text-violet-400 mb-1" />
            <p className="text-xl font-bold text-foreground">{profitMargin}%</p>
            <p className="text-xs text-violet-400/70">שולי רווח</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">טוען נתונים...</div>
      ) : (
        <>
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">ביצועים רבעוניים — {fiscalYear}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {quarterly.map((q, i) => (
                  <div key={i} className="p-4 bg-slate-800/30 rounded-lg">
                    <p className="text-sm font-bold text-slate-300 mb-2">{q.quarter}</p>
                    <p className="text-xs text-green-400/70">הכנסות: ₪{fmt(q.income)}</p>
                    <p className="text-xs text-red-400/70">הוצאות: ₪{fmt(q.expenses)}</p>
                    <p className={`text-sm font-bold mt-1 ${q.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      רווח: ₪{fmt(q.profit)}
                    </p>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={quarterly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="quarter" stroke="#94a3b8" fontSize={13} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }} formatter={(v: number) => [`₪${fmt(v)}`, ""]} />
                  <Legend />
                  <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="הכנסות" />
                  <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="הוצאות" />
                  <Bar dataKey="profit" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="רווח" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">טבלת סיכום חודשית — {fiscalYear}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="p-3 text-right text-muted-foreground">חודש</th>
                      <th className="p-3 text-right text-muted-foreground text-green-400/70">הכנסות</th>
                      <th className="p-3 text-right text-muted-foreground text-red-400/70">הוצאות</th>
                      <th className="p-3 text-right text-muted-foreground">רווח/הפסד</th>
                      <th className="p-3 text-right text-muted-foreground">מרווח %</th>
                      <th className="p-3 text-right text-muted-foreground">רבעון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">אין נתוני חודשים</td></tr>
                    ) : monthly.map((m, i) => {
                      const margin = m.income > 0 ? Math.round((m.profit / m.income) * 100) : 0;
                      const quarter = QUARTERS[Math.floor(i / 3)];
                      return (
                        <tr key={i} className="border-b border-slate-800/50">
                          <td className="p-3 text-foreground">{m.label}</td>
                          <td className="p-3 text-green-400">₪{fmt(m.income)}</td>
                          <td className="p-3 text-red-400">₪{fmt(m.expenses)}</td>
                          <td className={`p-3 font-medium ${m.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>₪{fmt(m.profit)}</td>
                          <td className="p-3"><span className={margin >= 0 ? "text-green-400" : "text-red-400"}>{margin}%</span></td>
                          <td className="p-3 text-muted-foreground">{quarter}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {monthly.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-slate-700 font-bold">
                        <td className="p-3 text-foreground">סה"כ {fiscalYear}</td>
                        <td className="p-3 text-green-400">₪{fmt(totalIncome)}</td>
                        <td className="p-3 text-red-400">₪{fmt(totalExpenses)}</td>
                        <td className={`p-3 ${grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>₪{fmt(grossProfit)}</td>
                        <td className="p-3 text-violet-400">{profitMargin}%</td>
                        <td className="p-3"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
