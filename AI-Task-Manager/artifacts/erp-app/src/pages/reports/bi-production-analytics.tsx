import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Factory, Gauge, Trash2, DollarSign, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ComposedChart
} from "recharts";
import { authJson } from "@/lib/utils";
import PeriodFilter, { usePeriodFilter, exportPDF } from "./components/period-filter";

function exportCSV(data: any[], filename: string) {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))];
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

const API = "/api";
const fmt = (v: number) => Math.abs(v).toLocaleString("he-IL", { minimumFractionDigits: 0 });
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
const MONTH_HE = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];

type ProdTab = "overview" | "machines" | "operators" | "waste" | "cost";

function KpiGauge({ label, value, max = 100, color = "blue", unit = "%" }: { label: string; value: number; max?: number; color?: string; unit?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const c: Record<string, string> = { blue: "#3b82f6", green: "#10b981", amber: "#f59e0b", red: "#ef4444" };
  return (
    <div className="flex flex-col items-center p-4 bg-slate-800/40 rounded-xl">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 36 36" className="transform -rotate-90 w-20 h-20">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#334155" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={c[color]} strokeWidth="3" strokeDasharray={`${pct}, 100`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-foreground">{value.toFixed(1)}{unit}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-center">{label}</p>
    </div>
  );
}

export default function BIProductionAnalytics() {
  const [activeTab, setActiveTab] = useState<ProdTab>("overview");
  const pf = usePeriodFilter();

  const { data, isLoading } = useQuery({
    queryKey: ["bi-production", ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/production?${pf.buildQueryParams()}`).catch(() => null),
  });

  const s = data?.summary || {};
  const monthly = (data?.monthlyOutput || []).map((m: any) => ({
    ...m,
    name: MONTH_HE[m.month - 1] || `${m.month}`,
  })).filter((m: any) => m.orders > 0 || m.output > 0);

  const costData = [
    { name: "חומרים", value: data?.costBreakdown?.material || 0, fill: "#3b82f6" },
    { name: "עבודה", value: data?.costBreakdown?.labor || 0, fill: "#10b981" },
    { name: "תקורה", value: data?.costBreakdown?.overhead || 0, fill: "#f59e0b" },
  ].filter(c => c.value > 0);

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports"><span className="flex items-center gap-1 hover:text-foreground cursor-pointer"><ChevronLeft className="w-4 h-4" />מרכז דוחות</span></Link>
        <span>/</span>
        <span className="text-foreground">ניתוח ייצור</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Factory className="w-6 h-6 text-amber-400" /> ניתוח ייצור — BI
        </h1>
        <p className="text-sm text-muted-foreground mt-1">OEE, יעילות, פסולת, עלויות ופירוט לפי מכונה ומפעיל</p>
      </div>

      <PeriodFilter
        period={pf.period} onPeriodChange={pf.setPeriod}
        year={pf.year} onYearChange={pf.setYear}
        month={pf.month} onMonthChange={pf.setMonth}
        quarter={pf.quarter} onQuarterChange={pf.setQuarter}
        customStart={pf.customStart} onCustomStartChange={pf.setCustomStart}
        customEnd={pf.customEnd} onCustomEndChange={pf.setCustomEnd}
        onExportCSV={() => exportCSV(data?.byMachine || [], `production-machines-${pf.year}.csv`)}
        onExportPDF={() => exportPDF("ניתוח ייצור — OEE, יעילות, פסולת, עלויות")}
      />

      {isLoading ? (
        <LoadingOverlay className="min-h-[200px]" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "הזמנות עבודה", value: s.totalOrders || 0, sub: `${s.completed || 0} הושלמו`, color: "text-foreground" },
              { label: "תפוקה כוללת", value: s.totalOutput || 0, sub: `${(s.completionRate || 0).toFixed(1)}% השלמה`, color: "text-green-400" },
              { label: "אחוז פסולת", value: (s.wasteRate || 0).toFixed(1) + "%", isStat: true, sub: `${s.totalOrders - s.completed || 0} לא הושלמו`, color: s.wasteRate > 5 ? "text-red-400" : "text-green-400" },
              { label: "עלות כוללת", value: s.totalCost || 0, sub: `${s.actualHours || 0} שעות בפועל`, color: "text-blue-400" },
            ].map((c, i) => (
              <Card key={i} className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className={`text-xl font-bold ${c.color}`}>
                    {c.isStat ? c.value : typeof c.value === "number" && !Number.isInteger(c.value) ? `₪${fmt(c.value as number)}` : typeof c.value === "number" && c.value > 999 ? `₪${fmt(c.value as number)}` : c.value?.toLocaleString?.() || c.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiGauge label="אחוז השלמה" value={s.completionRate || 0} color="green" />
            <KpiGauge label="יעילות" value={s.efficiency || 0} color="blue" />
            <KpiGauge label="אחוז פסולת" value={s.wasteRate || 0} max={20} color={s.wasteRate > 5 ? "red" : "amber"} />
            <KpiGauge label="ניצול שעות" value={s.estimatedHours > 0 ? Math.round((s.actualHours / s.estimatedHours) * 100) : 0} color="amber" />
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              { id: "overview", label: "סקירה", icon: Gauge },
              { id: "machines", label: "לפי מכונה", icon: Factory },
              { id: "operators", label: "לפי מפעיל", icon: Factory },
              { id: "waste", label: "פסולת", icon: Trash2 },
              { id: "cost", label: "עלויות", icon: DollarSign },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ProdTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div data-report-content>
          {activeTab === "overview" && (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardHeader><CardTitle className="text-sm">תפוקה חודשית</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                    <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
                    <Bar dataKey="orders" name="הזמנות" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="output" name="תפוקה" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {activeTab === "machines" && (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60">
                    <tr className="text-muted-foreground text-xs">
                      <th className="text-right py-3 px-4">מכונה</th>
                      <th className="text-right py-3 px-4">הזמנות</th>
                      <th className="text-right py-3 px-4">תפוקה</th>
                      <th className="text-right py-3 px-4">פסולת</th>
                      <th className="text-right py-3 px-4">% פסולת</th>
                      <th className="text-right py-3 px-4">עלות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byMachine || []).map((m: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 px-4 text-foreground">{m.machine}</td>
                        <td className="py-2 px-4 text-slate-300">{m.orders}</td>
                        <td className="py-2 px-4 text-green-400 font-medium">{fmt(m.output)}</td>
                        <td className="py-2 px-4 text-red-400">{fmt(m.rejected)}</td>
                        <td className="py-2 px-4">
                          <Badge className={`text-[10px] ${m.wasteRate > 5 ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                            {m.wasteRate}%
                          </Badge>
                        </td>
                        <td className="py-2 px-4 text-blue-400">₪{fmt(m.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {activeTab === "operators" && (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60">
                    <tr className="text-muted-foreground text-xs">
                      <th className="text-right py-3 px-4">מפעיל</th>
                      <th className="text-right py-3 px-4">הזמנות</th>
                      <th className="text-right py-3 px-4">תפוקה</th>
                      <th className="text-right py-3 px-4">שעות</th>
                      <th className="text-right py-3 px-4">תפוקה/שעה</th>
                      <th className="text-right py-3 px-4">עלות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byOperator || []).map((op: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 px-4 text-foreground">{op.operator}</td>
                        <td className="py-2 px-4 text-slate-300">{op.orders}</td>
                        <td className="py-2 px-4 text-green-400 font-medium">{fmt(op.output)}</td>
                        <td className="py-2 px-4 text-slate-300">{op.hours.toFixed(1)}</td>
                        <td className="py-2 px-4 text-amber-400 font-medium">{op.outputPerHour}</td>
                        <td className="py-2 px-4 text-blue-400">₪{fmt(op.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {activeTab === "waste" && (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">פסולת לפי מכונה</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={(data?.byMachine || []).slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis type="category" dataKey="machine" tick={{ fill: "#94a3b8", fontSize: 10 }} width={80} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Bar dataKey="rejected" name="פסולת" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">סיכום פסולת</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4 mt-2">
                    <div className="text-center p-6 bg-red-500/10 rounded-xl">
                      <p className="text-4xl font-bold text-red-400">{(s.wasteRate || 0).toFixed(1)}%</p>
                      <p className="text-sm text-muted-foreground mt-1">שיעור פסולת</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-3 bg-slate-800/40 rounded-xl">
                        <p className="text-lg font-bold text-foreground">{fmt(data?.wasteSummary?.totalOutput || 0)}</p>
                        <p className="text-xs text-muted-foreground">תפוקה תקינה</p>
                      </div>
                      <div className="text-center p-3 bg-slate-800/40 rounded-xl">
                        <p className="text-lg font-bold text-red-400">{fmt(data?.wasteSummary?.totalRejected || 0)}</p>
                        <p className="text-xs text-muted-foreground">יחידות פסולות</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            {(data?.wastePareto || []).length > 0 && (
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">פארטו פסולת לפי מכונה</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={(data?.wastePareto || []).slice(0, 8)} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="machine" tick={{ fill: "#94a3b8", fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={40} />
                      <YAxis yAxisId="left" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: "#f97316", fontSize: 11 }} unit="%" domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Bar yAxisId="left" dataKey="rejected" fill="#ef4444" name="פסולת" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#f97316" dot={{ fill: "#f97316" }} name="% מצטבר" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="mt-2 text-xs text-muted-foreground text-center">פארטו — 80% מהפסולת מגיעה ממכונות ספורות</div>
                </CardContent>
              </Card>
            )}
            </>
          )}

          {activeTab === "cost" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">פירוק עלויות</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={costData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {costData.map((c, i) => <Cell key={i} fill={c.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [`₪${fmt(Number(v))}`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">פירוט עלויות</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 mt-2">
                    {[
                      { label: "חומרי גלם", value: data?.costBreakdown?.material || 0, color: "bg-blue-500" },
                      { label: "עלויות עבודה", value: data?.costBreakdown?.labor || 0, color: "bg-green-500" },
                      { label: "תקורה", value: data?.costBreakdown?.overhead || 0, color: "bg-amber-500" },
                    ].map((item, i) => {
                      const total = data?.costBreakdown?.total || 1;
                      const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-300">{item.label}</span>
                            <span className="text-foreground font-medium">₪{fmt(item.value)} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-slate-700 rounded-full">
                            <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="border-t border-slate-700/50 pt-3 flex justify-between font-bold">
                      <span className="text-foreground">סה"כ עלות</span>
                      <span className="text-blue-400">₪{fmt(data?.costBreakdown?.total || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}
