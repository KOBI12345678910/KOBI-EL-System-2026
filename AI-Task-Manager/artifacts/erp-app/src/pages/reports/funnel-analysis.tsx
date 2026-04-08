import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Funnel, ChevronLeft, Users, Target, FileText,
  ShoppingCart, Receipt, DollarSign, Clock, TrendingUp, ArrowDown, Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line
} from "recharts";
import PeriodFilter, { usePeriodFilter, exportPDF } from "./components/period-filter";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }

const FUNNEL_COLORS = ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const FUNNEL_ICONS = [Users, FileText, Target, ShoppingCart, Receipt, DollarSign];

export default function FunnelAnalysis() {
  const pf = usePeriodFilter();

  const { data, isLoading } = useQuery({
    queryKey: ["funnel-analysis", ...pf.queryKey],
    queryFn: async () => {
      try {
        return await authJson(`${API}/reports-center/funnel?${pf.buildQueryParams()}`);
      } catch {
        return {};
      }
    },
  });

  const funnelSteps = data?.funnelSteps || [];
  const conversionByMonth = data?.conversionByMonth || [];
  const conversionByAgent = data?.conversionByAgent || [];
  const avgTimes = data?.avgTimes || {};
  const leadSourceBreakdown = data?.leadSourceBreakdown || [];

  function exportCSV() {
    let csv = "\uFEFF";
    csv += "שלב,כמות,שווי,יחס המרה,ימים ממוצע\n";
    funnelSteps.forEach((s: any) => { csv += `${s.stage},${s.count},${s.value},${s.conversionRate || '-'}%,${s.avgDays || '-'}\n`; });
    csv += "\nסוכן,הצעות,מאושרות,שווי מאושר,יחס המרה\n";
    conversionByAgent.forEach((a: any) => { csv += `${a.agent},${a.totalQuotes},${a.approved},${a.approvedValue},${a.rate}%\n`; });
    csv += "\nמקור ליד,לידים,הצעות,מאושרות,יחס המרה\n";
    leadSourceBreakdown.forEach((ls: any) => { csv += `${ls.source},${ls.leads},${ls.quotes},${ls.approved},${ls.conversionRate}%\n`; });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "funnel-analysis.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted/20" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
              <div className="h-4 w-2/3 rounded bg-muted/20" />
              <div className="h-8 w-1/2 rounded bg-muted/15" />
              <div className="h-24 w-full rounded bg-muted/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxFunnelCount = Math.max(...funnelSteps.map((s: any) => s.count || 0), 1);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          מרכז דוחות
        </Link>
        <span>/</span>
        <span className="text-foreground">יחסי המרה ומשפך מכירות</span>
      </div>

      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Funnel className="w-6 h-6 text-purple-400" /> יחסי המרה ומשפך מכירות
        </h1>
        <p className="text-muted-foreground mt-1">ניתוח מלא של שלבי ההמרה מליד ועד גבייה {data?.periodLabel ? `— ${data.periodLabel}` : ""}</p>
      </div>

      <PeriodFilter
        period={pf.period} onPeriodChange={pf.setPeriod}
        year={pf.year} onYearChange={pf.setYear}
        month={pf.month} onMonthChange={pf.setMonth}
        quarter={pf.quarter} onQuarterChange={pf.setQuarter}
        customStart={pf.customStart} onCustomStartChange={pf.setCustomStart}
        customEnd={pf.customEnd} onCustomEndChange={pf.setCustomEnd}
        onExportCSV={exportCSV}
        onExportPDF={() => exportPDF("יחסי המרה ומשפך מכירות")}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-purple-400">{data?.overallConversion || 0}%</p>
            <p className="text-xs text-purple-400/70">המרה כוללת</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-400">{avgTimes.quoteApproval || 0} ימים</p>
            <p className="text-xs text-blue-400/70">הצעה → אישור</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-cyan-400">{avgTimes.quoteToOrder || 0} ימים</p>
            <p className="text-xs text-cyan-400/70">אישור → הזמנה</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-amber-400">{avgTimes.orderToInvoice || 0} ימים</p>
            <p className="text-xs text-amber-400/70">הזמנה → חשבונית</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-400">{funnelSteps[funnelSteps.length - 1]?.conversionRate || 0}%</p>
            <p className="text-xs text-green-400/70">יחס גבייה</p>
          </CardContent>
        </Card>
      </div>

      <div data-report-content>
        <Card className="bg-slate-900/50 border-slate-700/50 mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Funnel className="w-4 h-4 text-purple-400" /> משפך מכירות (Sales Funnel)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-1">
              {funnelSteps.map((step: any, idx: number) => {
                const Icon = FUNNEL_ICONS[idx] || Users;
                const widthPct = Math.max((step.count / maxFunnelCount) * 100, 20);
                return (
                  <div key={idx} className="w-full">
                    <div
                      className="mx-auto rounded-lg p-4 flex items-center justify-between transition-all"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: FUNNEL_COLORS[idx] + "20",
                        borderLeft: `4px solid ${FUNNEL_COLORS[idx]}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5" style={{ color: FUNNEL_COLORS[idx] }} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{step.stage}</p>
                          <p className="text-xs text-muted-foreground">
                            {step.value > 0 ? fmt(step.value) : ""}
                            {step.avgDays > 0 ? ` | ${step.avgDays} ימים ממוצע` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-bold text-foreground">{step.count}</p>
                        {step.conversionRate !== undefined && step.conversionRate > 0 && (
                          <Badge className="text-[10px] bg-slate-700 text-slate-300">{step.conversionRate}% המרה</Badge>
                        )}
                      </div>
                    </div>
                    {idx < funnelSteps.length - 1 && (
                      <div className="text-center py-1">
                        <ArrowDown className="w-4 h-4 text-muted-foreground mx-auto" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {leadSourceBreakdown.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-700/50 mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" /> פילוח לפי מקור ליד
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700/50">
                    <th className="p-3 text-right text-muted-foreground">מקור</th>
                    <th className="p-3 text-right text-muted-foreground">לידים</th>
                    <th className="p-3 text-right text-muted-foreground">הצעות</th>
                    <th className="p-3 text-right text-muted-foreground">מאושרות</th>
                    <th className="p-3 text-right text-muted-foreground">יחס המרה</th>
                  </tr></thead>
                  <tbody>
                    {leadSourceBreakdown.map((ls: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-800/50">
                        <td className="p-3 text-foreground font-medium">{ls.source}</td>
                        <td className="p-3 text-slate-300">{ls.leads}</td>
                        <td className="p-3 text-blue-400">{ls.quotes}</td>
                        <td className="p-3 text-green-400">{ls.approved}</td>
                        <td className="p-3">
                          <Badge className={`${ls.conversionRate >= 30 ? "bg-green-500/20 text-green-400" : ls.conversionRate >= 10 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                            {ls.conversionRate}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" /> יחסי המרה לפי חודש
              </CardTitle>
            </CardHeader>
            <CardContent>
              {conversionByMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={conversionByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }} />
                    <Legend />
                    <Bar dataKey="quotes" fill="#3b82f6" name="הצעות מחיר" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="approved" fill="#10b981" name="מאושרות" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">אין נתוני המרה חודשיים</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" /> יחס המרה חודשי (%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {conversionByMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={conversionByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }} formatter={(value: number) => [`${value}%`, ""]} />
                    <Line type="monotone" dataKey="rate" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: "#8b5cf6" }} name="יחס המרה" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">אין נתונים</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" /> ביצועי סוכנים / נציגי מכירות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversionByAgent.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-700/50">
                    <th className="p-3 text-right text-muted-foreground">סוכן</th>
                    <th className="p-3 text-right text-muted-foreground">הצעות</th>
                    <th className="p-3 text-right text-muted-foreground">מאושרות</th>
                    <th className="p-3 text-right text-muted-foreground">שווי מאושר</th>
                    <th className="p-3 text-right text-muted-foreground">יחס המרה</th>
                  </tr></thead>
                  <tbody>
                    {conversionByAgent.map((agent: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-800/50">
                        <td className="p-3 text-foreground font-medium">{agent.agent}</td>
                        <td className="p-3 text-slate-300">{agent.totalQuotes}</td>
                        <td className="p-3 text-green-400">{agent.approved}</td>
                        <td className="p-3 text-blue-400">{fmt(agent.approvedValue)}</td>
                        <td className="p-3">
                          <Badge className={`${agent.rate >= 50 ? "bg-green-500/20 text-green-400" : agent.rate >= 25 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                            {agent.rate}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">אין נתוני סוכנים</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="funnel" entityId="all" />
        <RelatedRecords entityType="funnel" entityId="all" />
      </div>
    </div>
  );
}