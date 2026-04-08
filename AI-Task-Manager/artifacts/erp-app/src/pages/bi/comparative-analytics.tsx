import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3,
  DollarSign, ShoppingCart, Factory, ArrowUpRight, ArrowDownRight,
  Calendar, ChevronDown
} from "lucide-react";

const API_BASE = "/api";

const DOMAINS = [
  { value: "finance", label: "פיננסי", icon: DollarSign },
  { value: "sales", label: "מכירות", icon: ShoppingCart },
  { value: "production", label: "ייצור", icon: Factory },
];

const PERIODS = [
  { value: "year", label: "שנה" },
  { value: "quarter", label: "רבעון" },
  { value: "month", label: "חודש" },
];

const COMPARISON_MODES = [
  { value: "period", label: "תקופה מול תקופה" },
  { value: "budget", label: "תקציב מול ביצוע" },
  { value: "forecast", label: "תחזית מול ביצוע" },
];

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const QUARTERS = ["רבעון 1","רבעון 2","רבעון 3","רבעון 4"];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

function formatNum(val: number | null | undefined, format?: string): string {
  if (val === null || val === undefined) return "—";
  if (format === "currency") {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(val);
  }
  if (format === "percent") return `${val}%`;
  return val.toLocaleString("he-IL");
}

function VarianceBadge({ value, percent, favorable }: { value: number; percent: number | null; favorable: "up" | "down" }) {
  if (value === 0) return <Badge className="bg-gray-500/20 text-gray-300 text-xs"><Minus className="w-3 h-3 ml-0.5" />0%</Badge>;
  const isGood = favorable === "up" ? value > 0 : value < 0;
  const isUp = value > 0;
  return (
    <Badge className={`text-xs ${isGood ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
      {isUp ? <ArrowUpRight className="w-3 h-3 ml-0.5" /> : <ArrowDownRight className="w-3 h-3 ml-0.5" />}
      {percent !== null ? `${Math.abs(percent)}%` : (value > 0 ? "+" : "") + value.toLocaleString("he-IL")}
    </Badge>
  );
}

function PeriodSelector({ label, period, year, month, quarter, onChange }: {
  label: string;
  period: string;
  year: number;
  month: number;
  quarter: number;
  onChange: (year: number, month: number, quarter: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground font-medium">{label}:</span>
      <select value={year} onChange={e => onChange(parseInt(e.target.value), month, quarter)} className="bg-background/50 border border-border rounded px-2 py-1 text-sm text-foreground">
        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      {period === "month" && (
        <select value={month} onChange={e => onChange(year, parseInt(e.target.value), quarter)} className="bg-background/50 border border-border rounded px-2 py-1 text-sm text-foreground">
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
      )}
      {period === "quarter" && (
        <select value={quarter} onChange={e => onChange(year, month, parseInt(e.target.value))} className="bg-background/50 border border-border rounded px-2 py-1 text-sm text-foreground">
          {QUARTERS.map((q, i) => <option key={i} value={i + 1}>{q}</option>)}
        </select>
      )}
    </div>
  );
}

function BudgetVsActualTable({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-muted-foreground">טוען...</div>;
  const rows = data.rows || [];
  const summary = data.summary || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "סה\"כ תקציב", value: formatNum(summary.totalBudgeted, "currency"), color: "text-blue-400" },
          { label: "ביצוע בפועל", value: formatNum(summary.totalActual, "currency"), color: "text-foreground" },
          { label: "תחזית", value: formatNum(summary.totalForecast, "currency"), color: "text-purple-400" },
          { label: "חריגות", value: summary.overBudgetCount || 0, color: "text-red-400" },
        ].map(item => (
          <Card key={item.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
              <th className="text-right p-3 text-muted-foreground font-medium">מחלקה</th>
              <th className="text-left p-3 text-muted-foreground font-medium">תקציב</th>
              <th className="text-left p-3 text-muted-foreground font-medium">ביצוע</th>
              <th className="text-left p-3 text-muted-foreground font-medium">תחזית</th>
              <th className="text-left p-3 text-muted-foreground font-medium">סטייה</th>
              <th className="text-left p-3 text-muted-foreground font-medium">ניצול</th>
              <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, idx: number) => (
              <tr key={idx} className="border-b border-border/30 hover:bg-card/30">
                <td className="p-3 text-foreground font-medium">{row.category}</td>
                <td className="p-3 text-muted-foreground text-xs">{row.department || "—"}</td>
                <td className="p-3 text-left text-foreground">{formatNum(row.budgeted, "currency")}</td>
                <td className="p-3 text-left text-foreground font-medium">{formatNum(row.actual, "currency")}</td>
                <td className="p-3 text-left text-purple-300">{formatNum(row.forecast, "currency")}</td>
                <td className="p-3 text-left">
                  <span className={row.variance > 0 ? "text-red-300" : "text-green-300"}>
                    {row.variance > 0 ? "+" : ""}{formatNum(row.variance, "currency")}
                  </span>
                  {row.variancePct !== null && <span className="text-xs text-muted-foreground ml-1">({row.variancePct}%)</span>}
                </td>
                <td className="p-3 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-border/50 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${row.utilization >= 100 ? "bg-red-500" : row.utilization >= 90 ? "bg-orange-500" : row.utilization >= 80 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, row.utilization)}%` }} />
                    </div>
                    <span className="text-xs text-foreground">{row.utilization}%</span>
                  </div>
                </td>
                <td className="p-3 text-center">
                  <Badge className={
                    row.status === "over" ? "bg-red-500/20 text-red-300" :
                    row.status === "warning" ? "bg-orange-500/20 text-orange-300" :
                    row.status === "alert" ? "bg-yellow-500/20 text-yellow-300" :
                    "bg-green-500/20 text-green-300"
                  }>
                    {row.status === "over" ? "חריגה" : row.status === "warning" ? "אזהרה" : row.status === "alert" ? "התראה" : "תקין"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ForecastVsActualChart({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-muted-foreground">טוען...</div>;
  const months = data.months || [];
  const maxVal = Math.max(...months.map((m: any) => Math.max(m.actualIncome || 0, m.actualExpenses || 0, m.forecast || 0, m.budgeted || 0, 1)));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-right p-2 text-muted-foreground font-medium">חודש</th>
              <th className="text-left p-2 text-muted-foreground font-medium">הכנסות בפועל</th>
              <th className="text-left p-2 text-muted-foreground font-medium">הוצאות בפועל</th>
              <th className="text-left p-2 text-muted-foreground font-medium">תקציב</th>
              <th className="text-left p-2 text-muted-foreground font-medium">תחזית</th>
              <th className="text-left p-2 text-muted-foreground font-medium">סטייה הכנסות</th>
              <th className="text-left p-2 text-muted-foreground font-medium">סטייה הוצאות</th>
              <th className="text-center p-2 text-muted-foreground font-medium">גרף</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m: any) => (
              <tr key={m.month} className={`border-b border-border/30 hover:bg-card/30 ${!m.isActual ? "opacity-60" : ""}`}>
                <td className="p-2 text-foreground">
                  <div className="flex items-center gap-1.5">
                    {m.monthLabel}
                    {!m.isActual && <Badge className="bg-purple-500/20 text-purple-300 text-xs">תחזית</Badge>}
                  </div>
                </td>
                <td className="p-2 text-left text-foreground">{formatNum(m.actualIncome, "currency")}</td>
                <td className="p-2 text-left text-foreground">{formatNum(m.actualExpenses, "currency")}</td>
                <td className="p-2 text-left text-blue-300">{formatNum(m.budgeted, "currency")}</td>
                <td className="p-2 text-left text-purple-300">{formatNum(m.forecast, "currency")}</td>
                <td className="p-2 text-left">
                  {m.isActual && m.incomeVariance !== null ? (
                    <span className={m.incomeVariance >= 0 ? "text-green-300" : "text-red-300"}>
                      {m.incomeVariance >= 0 ? "+" : ""}{formatNum(m.incomeVariance, "currency")}
                    </span>
                  ) : "—"}
                </td>
                <td className="p-2 text-left">
                  {m.isActual && m.expenseVariance !== null ? (
                    <span className={m.expenseVariance <= 0 ? "text-green-300" : "text-red-300"}>
                      {m.expenseVariance >= 0 ? "+" : ""}{formatNum(m.expenseVariance, "currency")}
                    </span>
                  ) : "—"}
                </td>
                <td className="p-2 text-center">
                  <div className="w-24 h-3 bg-border/30 rounded-full overflow-hidden mx-auto">
                    {m.isActual && m.actualIncome > 0 && (
                      <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${Math.min(100, (m.actualIncome / maxVal) * 100)}%` }} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ComparativeAnalytics() {
  const [comparisonMode, setComparisonMode] = useState("period");
  const [domain, setDomain] = useState("finance");
  const [period, setPeriod] = useState("year");
  const [year1, setYear1] = useState(currentYear);
  const [month1, setMonth1] = useState(new Date().getMonth() + 1);
  const [quarter1, setQuarter1] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [year2, setYear2] = useState(currentYear - 1);
  const [month2, setMonth2] = useState(new Date().getMonth() + 1);
  const [quarter2, setQuarter2] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [budgetYear, setBudgetYear] = useState(currentYear);
  const [budgetMonth, setBudgetMonth] = useState<number | null>(null);

  const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const headers = { Authorization: `Bearer ${authToken}` };

  const periodsQuery = useQuery({
    queryKey: ["bi-comparative-periods", domain, period, year1, month1, quarter1, year2, month2, quarter2],
    queryFn: async () => {
      const params = new URLSearchParams({ domain, period, year1: String(year1), year2: String(year2) });
      if (period === "month") { params.set("month1", String(month1)); params.set("month2", String(month2)); }
      if (period === "quarter") { params.set("quarter1", String(quarter1)); params.set("quarter2", String(quarter2)); }
      const r = await fetch(`${API_BASE}/bi/comparative/periods?${params}`, { headers });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: comparisonMode === "period",
  });

  const budgetQuery = useQuery({
    queryKey: ["bi-comparative-budget", budgetYear, budgetMonth],
    queryFn: async () => {
      const params = new URLSearchParams({ year: String(budgetYear) });
      if (budgetMonth) params.set("month", String(budgetMonth));
      const r = await fetch(`${API_BASE}/bi/comparative/budget-vs-actual?${params}`, { headers });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: comparisonMode === "budget",
  });

  const forecastQuery = useQuery({
    queryKey: ["bi-comparative-forecast", budgetYear],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bi/comparative/forecast-vs-actual?year=${budgetYear}`, { headers });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: comparisonMode === "forecast",
  });

  const compareData = periodsQuery.data;
  const metrics = compareData?.metrics || [];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">אנליטיקה השוואתית</h1>
          <p className="text-sm text-muted-foreground mt-1">תקופה מול תקופה, תקציב מול ביצוע, תחזית מול ביצוע</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { periodsQuery.refetch(); budgetQuery.refetch(); forecastQuery.refetch(); }}>
          <RefreshCw className="w-4 h-4 ml-1" />רענן
        </Button>
      </div>

      <div className="flex gap-1 border-b border-border/50">
        {COMPARISON_MODES.map(mode => (
          <button key={mode.value} onClick={() => setComparisonMode(mode.value)} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${comparisonMode === mode.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {mode.label}
          </button>
        ))}
      </div>

      {comparisonMode === "period" && (
        <div className="space-y-5">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-foreground text-sm">הגדרות השוואה</h3>
              <div className="flex flex-wrap gap-4">
                <div>
                  <span className="text-xs text-muted-foreground block mb-1.5">תחום</span>
                  <div className="flex gap-1">
                    {DOMAINS.map(d => (
                      <button key={d.value} onClick={() => setDomain(d.value)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${domain === d.value ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                        <d.icon className="w-3.5 h-3.5" />{d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1.5">סוג תקופה</span>
                  <div className="flex gap-1">
                    {PERIODS.map(p => (
                      <button key={p.value} onClick={() => setPeriod(p.value)} className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${period === p.value ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="text-xs font-medium text-blue-400 mb-2">תקופה נוכחית</div>
                  <PeriodSelector label="" period={period} year={year1} month={month1} quarter={quarter1} onChange={(y, m, q) => { setYear1(y); setMonth1(m); setQuarter1(q); }} />
                </div>
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <div className="text-xs font-medium text-purple-400 mb-2">תקופה להשוואה</div>
                  <PeriodSelector label="" period={period} year={year2} month={month2} quarter={quarter2} onChange={(y, m, q) => { setYear2(y); setMonth2(m); setQuarter2(q); }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {periodsQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />טוען...</div>
          ) : compareData ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-sm font-medium text-blue-400 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">{compareData.period1?.label}</div>
                  <span className="text-muted-foreground">לעומת</span>
                  <div className="text-sm font-medium text-purple-400 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">{compareData.period2?.label}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right p-3 text-muted-foreground font-medium">מדד</th>
                        <th className="text-left p-3 text-blue-400 font-medium">{compareData.period1?.label}</th>
                        <th className="text-left p-3 text-purple-400 font-medium">{compareData.period2?.label}</th>
                        <th className="text-left p-3 text-muted-foreground font-medium">סטייה מוחלטת</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">שינוי %</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">מגמה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m: any) => {
                        const isGood = m.favorable === "up" ? m.absoluteVariance >= 0 : m.absoluteVariance <= 0;
                        return (
                          <tr key={m.key} className="border-b border-border/30 hover:bg-card/30">
                            <td className="p-3 text-foreground font-medium">{m.label}</td>
                            <td className="p-3 text-left font-medium text-blue-300">{formatNum(m.period1, m.format)}</td>
                            <td className="p-3 text-left text-purple-300">{formatNum(m.period2, m.format)}</td>
                            <td className="p-3 text-left">
                              <span className={isGood ? "text-green-300" : "text-red-300"}>
                                {m.absoluteVariance >= 0 ? "+" : ""}{formatNum(m.absoluteVariance, m.format)}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {m.percentVariance !== null ? (
                                <VarianceBadge value={m.absoluteVariance} percent={m.percentVariance} favorable={m.favorable} />
                              ) : "—"}
                            </td>
                            <td className="p-3 text-center">
                              {m.direction === "up" ? <TrendingUp className={`w-4 h-4 mx-auto ${isGood ? "text-green-400" : "text-red-400"}`} /> :
                               m.direction === "down" ? <TrendingDown className={`w-4 h-4 mx-auto ${isGood ? "text-green-400" : "text-red-400"}`} /> :
                               <Minus className="w-4 h-4 mx-auto text-gray-400" />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {comparisonMode === "budget" && (
        <div className="space-y-5">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-foreground text-sm">הגדרות תקציב מול ביצוע</h3>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">שנה</span>
                  <select value={budgetYear} onChange={e => setBudgetYear(parseInt(e.target.value))} className="bg-background/50 border border-border rounded px-2 py-1.5 text-sm text-foreground">
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">חודש (אופציונלי)</span>
                  <select value={budgetMonth || ""} onChange={e => setBudgetMonth(e.target.value ? parseInt(e.target.value) : null)} className="bg-background/50 border border-border rounded px-2 py-1.5 text-sm text-foreground">
                    <option value="">כל השנה</option>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
          {budgetQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />טוען...</div>
          ) : (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <BudgetVsActualTable data={budgetQuery.data} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {comparisonMode === "forecast" && (
        <div className="space-y-5">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">שנה:</span>
                <select value={budgetYear} onChange={e => setBudgetYear(parseInt(e.target.value))} className="bg-background/50 border border-border rounded px-2 py-1.5 text-sm text-foreground">
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>
          {forecastQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />טוען...</div>
          ) : (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <h3 className="font-semibold text-foreground text-sm mb-4">תחזית מול ביצוע — {budgetYear}</h3>
                <ForecastVsActualChart data={forecastQuery.data} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
