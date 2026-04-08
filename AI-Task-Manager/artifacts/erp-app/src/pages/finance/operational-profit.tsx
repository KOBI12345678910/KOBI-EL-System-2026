import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Calendar, Download, Printer, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authJson } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine
} from "recharts";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }
function fmtPct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`; }

const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const MONTHS_SHORT = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];

const PERIOD_OPTIONS = [
  { value: "monthly", label: "חודשי" },
  { value: "quarterly", label: "רבעוני" },
  { value: "yearly", label: "שנתי" },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 text-sm" dir="rtl">
      <div className="text-slate-300 font-medium mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground font-bold">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function OperationalProfitPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [period, setPeriod] = useState("monthly");
  const [fromMonth, setFromMonth] = useState("1");
  const [toMonth, setToMonth] = useState("12");

  const { data, isLoading } = useQuery({
    queryKey: ["operational-profit", year, period, fromMonth, toMonth],
    queryFn: () => authJson(`${API}/finance/reports/operational-profit?year=${year}&period=${period}&from_month=${fromMonth}&to_month=${toMonth}`),
  });

  const months = data?.months || [];
  const summary = data?.summary || {};

  const chartData = months.length > 0 ? months.map((m: any) => ({
    month: MONTHS_SHORT[(m.month || 1) - 1] || m.label || "",
    income: Number(m.income || 0),
    expenses: Number(m.expenses || 0),
    profit: Number(m.profit || 0),
  })) : MONTHS_SHORT.map(m => ({ month: m, income: 0, expenses: 0, profit: 0 }));

  const totalIncome = Number(summary.total_income || 0);
  const totalExpenses = Number(summary.total_expenses || 0);
  const totalProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (totalProfit / totalIncome * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-400" /> רווח תפעולי
          </h1>
          <p className="text-muted-foreground mt-1">הכנסות מול הוצאות — ניתוח רווחיות</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-slate-600" onClick={() => window.print()}>
            <Printer className="w-4 h-4 ml-2" />הדפסה
          </Button>
          <Button variant="outline" className="border-slate-600">
            <Download className="w-4 h-4 ml-2" />ייצוא
          </Button>
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">תקופה</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-28 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">שנה</label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-24 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">מחודש</label>
              <Select value={fromMonth} onValueChange={setFromMonth}>
                <SelectTrigger className="w-28 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {MONTHS_HE.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">עד חודש</label>
              <Select value={toMonth} onValueChange={setToMonth}>
                <SelectTrigger className="w-28 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {MONTHS_HE.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">סה"כ הכנסות</div>
            <div className="text-xl font-bold text-green-400">{fmt(totalIncome)}</div>
            <div className="flex items-center gap-1 mt-1">
              <ArrowUpRight className="w-3 h-3 text-green-500" />
              <span className="text-xs text-green-500">הכנסות ללא מע"מ</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">סה"כ הוצאות</div>
            <div className="text-xl font-bold text-red-400">{fmt(totalExpenses)}</div>
            <div className="flex items-center gap-1 mt-1">
              <ArrowDownRight className="w-3 h-3 text-red-500" />
              <span className="text-xs text-red-500">הוצאות ללא מע"מ</span>
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br ${totalProfit >= 0 ? 'from-blue-500/10 to-blue-600/5 border-blue-500/20' : 'from-red-500/10 to-red-600/5 border-red-500/20'}`}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">רווח תפעולי</div>
            <div className={`text-xl font-bold ${totalProfit >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(totalProfit)}</div>
            <div className="flex items-center gap-1 mt-1">
              {totalProfit >= 0 ? <ArrowUpRight className="w-3 h-3 text-blue-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
              <span className={`text-xs ${totalProfit >= 0 ? 'text-blue-500' : 'text-red-500'}`}>הכנסות פחות הוצאות</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">מרווח רווח</div>
            <div className={`text-xl font-bold ${profitMargin >= 0 ? 'text-purple-400' : 'text-red-400'}`}>{fmtPct(profitMargin)}</div>
            <div className="flex items-center gap-1 mt-1">
              <Minus className="w-3 h-3 text-purple-500" />
              <span className="text-xs text-purple-500">אחוז רווחיות</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" /> הכנסות מול הוצאות — לפי חודש
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(val) => <span className="text-xs text-slate-300">{val}</span>} />
                <ReferenceLine y={0} stroke="#64748b" />
                <Bar dataKey="income" name="הכנסות" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="הוצאות" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {months.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-base text-foreground">פירוט לפי חודש</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="p-3 text-right text-muted-foreground font-medium">חודש</th>
                    <th className="p-3 text-center text-muted-foreground font-medium">הכנסות</th>
                    <th className="p-3 text-center text-muted-foreground font-medium">הוצאות</th>
                    <th className="p-3 text-center text-muted-foreground font-medium">רווח</th>
                    <th className="p-3 text-center text-muted-foreground font-medium">מרווח %</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m: any, i: number) => {
                    const inc = Number(m.income || 0);
                    const exp = Number(m.expenses || 0);
                    const prof = inc - exp;
                    const marg = inc > 0 ? (prof / inc * 100) : 0;
                    return (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="p-3 text-foreground font-medium">{MONTHS_HE[(m.month || 1) - 1] || m.label}</td>
                        <td className="p-3 text-center text-green-400">{fmt(inc)}</td>
                        <td className="p-3 text-center text-red-400">{fmt(exp)}</td>
                        <td className={`p-3 text-center font-bold ${prof >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(prof)}</td>
                        <td className={`p-3 text-center ${marg >= 0 ? 'text-purple-400' : 'text-red-400'}`}>{fmtPct(marg)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-800/50 font-bold">
                    <td className="p-3 text-foreground">סה"כ</td>
                    <td className="p-3 text-center text-green-400">{fmt(totalIncome)}</td>
                    <td className="p-3 text-center text-red-400">{fmt(totalExpenses)}</td>
                    <td className={`p-3 text-center ${totalProfit >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt(totalProfit)}</td>
                    <td className={`p-3 text-center ${profitMargin >= 0 ? 'text-purple-400' : 'text-red-400'}`}>{fmtPct(profitMargin)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 space-y-6">
        <RelatedRecords
          tabs={[
            {
              key: "expense_breakdown",
              label: "פירוט הוצאות",
              icon: "payments",
              endpoint: `${API}/expense-reports?limit=5`,
              columns: [
                { key: "report_number", label: "מספר" },
                { key: "employee_name", label: "עובד" },
                { key: "total_amount", label: "סכום" },
                { key: "status", label: "סטטוס" },
              ],
            },
            {
              key: "income_records",
              label: "רשומות הכנסה",
              icon: "documents",
              endpoint: `${API}/ar?limit=5`,
              columns: [
                { key: "invoice_number", label: "חשבונית" },
                { key: "customer_name", label: "לקוח" },
                { key: "amount", label: "סכום" },
                { key: "status", label: "סטטוס" },
              ],
            },
          ]}
        />
        <ActivityLog entityType="operational-profit" />
      </div>
    </div>
  );
}
