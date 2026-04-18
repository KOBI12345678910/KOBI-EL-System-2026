import { LoadingOverlay } from "@/components/ui/unified-states";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Shield, AlertTriangle, ChevronLeft, Users, Truck,
  DollarSign, Droplets, BarChart3, Gauge, Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie
} from "recharts";
import PeriodFilter, { usePeriodFilter, exportPDF } from "./components/period-filter";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }

const RISK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-green-500/20", text: "text-green-400", label: "נמוך" },
  medium: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "בינוני" },
  high: { bg: "bg-red-500/20", text: "text-red-400", label: "גבוה" },
};

const HEATMAP_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#ef4444",
};

const FX_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function RiskAnalysis() {
  const pf = usePeriodFilter();

  const { data, isLoading } = useQuery({
    queryKey: ["risk-analysis", ...pf.queryKey],
    queryFn: async () => {
      try {
        return await authJson(`${API}/reports-center/risks?${pf.buildQueryParams()}`);
      } catch {
        return {};
      }
    },
  });

  const customerConcentration = data?.customerConcentration || [];
  const supplierConcentration = data?.supplierConcentration || [];
  const aging = data?.agingAnalysis || {};
  const liquidity = data?.liquidityMetrics || {};
  const overdueStats = data?.overdueStats || {};
  const riskHeatMap = data?.riskHeatMap || [];
  const fxExposure = data?.fxExposure || [];
  const totalFxExposure = data?.totalFxExposure || 0;

  const agingBuckets = [
    { label: "שוטף", value: Number(aging.current_amount || 0), color: "#10b981" },
    { label: "1-30 יום", value: Number(aging.days_1_30 || 0), color: "#f59e0b" },
    { label: "31-60 יום", value: Number(aging.days_31_60 || 0), color: "#f97316" },
    { label: "61-90 יום", value: Number(aging.days_61_90 || 0), color: "#ef4444" },
    { label: "90+ יום", value: Number(aging.over_90 || 0), color: "#b91c1c" },
  ];

  function exportCSV() {
    let csv = "\uFEFF";
    csv += "קטגוריית סיכון,רמה,ערך\n";
    riskHeatMap.forEach((r: any) => { csv += `${r.category},${r.level},${r.value}\n`; });
    csv += "\nלקוח,סכום,אחוז\n";
    customerConcentration.forEach((c: any) => { csv += `${c.name},${c.total},${c.percentage}%\n`; });
    csv += "\nמטבע,חשיפה,מספר מסמכים\n";
    fxExposure.forEach((fx: any) => { csv += `${fx.currency},${fx.exposure},${fx.docCount}\n`; });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "risk-analysis.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return <LoadingOverlay className="min-h-[200px]" />;
  }

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          מרכז דוחות
        </Link>
        <span>/</span>
        <span className="text-foreground">ניתוחי סיכונים וגידורים</span>
      </div>

      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6 text-red-400" /> ניתוחי סיכונים וגידורים
        </h1>
        <p className="text-muted-foreground mt-1">ריכוזיות, נזילות, גיול חובות, חשיפת מטח ומפת סיכונים {data?.periodLabel ? `— ${data.periodLabel}` : ""}</p>
      </div>

      <PeriodFilter
        period={pf.period} onPeriodChange={pf.setPeriod}
        year={pf.year} onYearChange={pf.setYear}
        month={pf.month} onMonthChange={pf.setMonth}
        quarter={pf.quarter} onQuarterChange={pf.setQuarter}
        customStart={pf.customStart} onCustomStartChange={pf.setCustomStart}
        customEnd={pf.customEnd} onCustomEndChange={pf.setCustomEnd}
        onExportCSV={exportCSV}
        onExportPDF={() => exportPDF("ניתוחי סיכונים וגידורים")}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <Droplets className="w-5 h-5 text-green-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{fmt(liquidity.totalCash || 0)}</p>
            <p className="text-xs text-green-400/70">נזילות</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <Gauge className="w-5 h-5 text-blue-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{liquidity.currentRatio || 0}x</p>
            <p className="text-xs text-blue-400/70">יחס שוטף</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-red-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{overdueStats.overdue_count || 0}</p>
            <p className="text-xs text-red-400/70">חשבוניות באיחור</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-4">
            <DollarSign className="w-5 h-5 text-orange-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{fmt(Number(overdueStats.overdue_amount || 0))}</p>
            <p className="text-xs text-orange-400/70">סכום באיחור</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <Globe className="w-5 h-5 text-purple-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{fmt(totalFxExposure)}</p>
            <p className="text-xs text-purple-400/70">חשיפת מטח</p>
          </CardContent>
        </Card>
      </div>

      <div data-report-content>
        <Card className="bg-slate-900/50 border-slate-700/50 mb-6">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> מפת סיכונים (Heat Map)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {riskHeatMap.map((risk: any) => {
                const rc = RISK_COLORS[risk.level] || RISK_COLORS.medium;
                return (
                  <div key={risk.category} className={`p-4 rounded-xl border-2 ${rc.bg} border-opacity-30`} style={{ borderColor: HEATMAP_COLORS[risk.level] + "40" }}>
                    <p className="text-xs text-muted-foreground mb-1">{risk.category}</p>
                    <p className={`text-lg font-bold ${rc.text}`}>{typeof risk.value === 'number' ? fmt(risk.value) : risk.value}</p>
                    <Badge className={`mt-1 ${rc.bg} ${rc.text} text-[10px]`}>{rc.label}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700/50 mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-purple-400" /> חשיפת מטח ומפת גידור
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fxExposure.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={fxExposure} cx="50%" cy="50%" outerRadius={90} dataKey="exposure" nameKey="currency"
                      label={({ currency, percent }: any) => `${currency} ${(percent * 100).toFixed(0)}%`}>
                      {fxExposure.map((fx: any, idx: number) => <Cell key={fx.currency} fill={FX_COLORS[idx % FX_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => [fmt(value), ""]} contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {fxExposure.map((fx: any, idx: number) => (
                    <div key={fx.currency} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: FX_COLORS[idx % FX_COLORS.length] }} />
                        <span className="text-sm font-medium text-foreground">{fx.currency}</span>
                        <span className="text-xs text-muted-foreground">({fx.docCount} מסמכים)</span>
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-medium text-foreground">{fmt(fx.exposure)}</span>
                        {fx.currency !== "ILS" && (
                          <Badge className="mr-2 text-[10px] bg-yellow-500/20 text-yellow-400">
                            חשיפה
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {totalFxExposure > 0 && (
                    <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/10">
                      <p className="text-xs text-orange-400 mb-1">אסטרטגיית גידור מומלצת</p>
                      <p className="text-sm text-foreground">
                        {totalFxExposure > 100000
                          ? "חשיפה גבוהה — מומלץ לבצע גידור Forward / Options לתקופה של 3-6 חודשים"
                          : totalFxExposure > 30000
                          ? "חשיפה בינונית — יש לשקול עסקאות Forward לתקופה קצרה"
                          : "חשיפה נמוכה — ניתן להמתין עם גידור, לעקוב אחר מגמות"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">אין חשיפת מטח פתוחה</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" /> ריכוזיות לקוחות (% הכנסה)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customerConcentration.length > 0 ? (
                <div className="space-y-2">
                  {customerConcentration.slice(0, 10).map((c: any) => (
                    <div key={c.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-300 truncate max-w-[150px]">{c.name || "—"}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{fmt(c.total)}</span>
                          <Badge className={`text-[10px] ${c.percentage > 30 ? "bg-red-500/20 text-red-400" : c.percentage > 15 ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}`}>
                            {c.percentage}%
                          </Badge>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${c.percentage > 30 ? "bg-red-500" : c.percentage > 15 ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${Math.min(c.percentage, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">אין נתוני לקוחות</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="w-4 h-4 text-orange-400" /> ריכוזיות ספקים (% רכש)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {supplierConcentration.length > 0 ? (
                <div className="space-y-2">
                  {supplierConcentration.slice(0, 10).map((s: any) => (
                    <div key={s.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-300 truncate max-w-[150px]">{s.name || "—"}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{fmt(s.total)}</span>
                          <Badge className={`text-[10px] ${s.percentage > 30 ? "bg-red-500/20 text-red-400" : s.percentage > 15 ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}`}>
                            {s.percentage}%
                          </Badge>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${s.percentage > 30 ? "bg-red-500" : s.percentage > 15 ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${Math.min(s.percentage, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">אין נתוני ספקים</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-900/50 border-slate-700/50 mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-yellow-400" /> ניתוח גיול חובות (Aging Analysis)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={agingBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }} formatter={(value: number) => [fmt(value), ""]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="סכום">
                    {agingBuckets.map((entry) => <Cell key={entry.label} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {agingBuckets.map((bucket) => (
                  <div key={bucket.label} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bucket.color }} />
                      <span className="text-sm text-slate-300">{bucket.label}</span>
                    </div>
                    <span className="text-sm font-medium text-foreground">{fmt(bucket.value)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700 font-bold">
                  <span className="text-foreground">סה"כ</span>
                  <span className="text-foreground">{fmt(agingBuckets.reduce((s, b) => s + b.value, 0))}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Droplets className="w-4 h-4 text-blue-400" /> מדדי נזילות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-800/30 text-center">
                <p className="text-lg sm:text-2xl font-bold text-green-400">{fmt(liquidity.totalCash || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">מזומן</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/30 text-center">
                <p className="text-lg sm:text-2xl font-bold text-blue-400">{fmt(liquidity.totalReceivables || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">חייבים</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/30 text-center">
                <p className="text-lg sm:text-2xl font-bold text-red-400">{fmt(liquidity.shortTermLiabilities || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">התחייבויות שוטפות</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/30 text-center">
                <p className={`text-lg sm:text-2xl font-bold ${(liquidity.currentRatio || 0) >= 1.5 ? "text-green-400" : (liquidity.currentRatio || 0) >= 1 ? "text-yellow-400" : "text-red-400"}`}>
                  {liquidity.currentRatio || 0}x
                </p>
                <p className="text-xs text-muted-foreground mt-1">יחס שוטף</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="risk" entityId="all" />
        <RelatedRecords entityType="risk" entityId="all" />
      </div>
    </div>
  );
}