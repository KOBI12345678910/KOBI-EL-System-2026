import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Package, AlertTriangle, Clock, DollarSign, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
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
const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

type InvTab = "overview" | "aging" | "slow" | "dead" | "reorder" | "valuation";

export default function BIInventoryAnalytics() {
  const [activeTab, setActiveTab] = useState<InvTab>("overview");
  const [slowMovingDays, setSlowMovingDays] = useState(90);
  const [valuationMethod, setValuationMethod] = useState<"weighted_avg" | "fifo">("weighted_avg");
  const pf = usePeriodFilter();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["bi-inventory", slowMovingDays, valuationMethod, ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/inventory?slowMovingDays=${slowMovingDays}&valuationMethod=${valuationMethod}&${pf.buildQueryParams()}`).catch(() => null),
  });

  const v = data?.valuation || {};
  const aging = data?.aging || {};

  const agingChartData = [
    { name: "0–30 יום", value: aging.bucket0_30 || 0, fill: "#10b981" },
    { name: "31–60 יום", value: aging.bucket31_60 || 0, fill: "#3b82f6" },
    { name: "61–90 יום", value: aging.bucket61_90 || 0, fill: "#f59e0b" },
    { name: "91–120 יום", value: aging.bucket91_120 || 0, fill: "#ef4444" },
    { name: "120+ יום", value: aging.bucket120Plus || 0, fill: "#8b5cf6" },
  ].filter(a => a.value > 0);

  const totalAgingValue = agingChartData.reduce((s, a) => s + a.value, 0) || 1;

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports"><span className="flex items-center gap-1 hover:text-foreground cursor-pointer"><ChevronLeft className="w-4 h-4" />מרכז דוחות</span></Link>
        <span>/</span>
        <span className="text-foreground">ניתוח מלאי</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-cyan-400" /> ניתוח מלאי — BI
        </h1>
        <p className="text-sm text-muted-foreground mt-1">שווי מלאי, הזדקנות, מלאי איטי, מלאי דומם, התראות הזמנה מחדש</p>
      </div>

      <PeriodFilter
        period={pf.period} onPeriodChange={pf.setPeriod}
        year={pf.year} onYearChange={pf.setYear}
        month={pf.month} onMonthChange={pf.setMonth}
        quarter={pf.quarter} onQuarterChange={pf.setQuarter}
        customStart={pf.customStart} onCustomStartChange={pf.setCustomStart}
        customEnd={pf.customEnd} onCustomEndChange={pf.setCustomEnd}
        onExportCSV={() => exportCSV(data?.slowMoving || [], `inventory-slow-moving-${pf.year}.csv`)}
        onExportPDF={() => exportPDF("ניתוח מלאי — שווי, הזדקנות, מלאי דומם")}
      />

      {isLoading ? (
        <LoadingOverlay className="min-h-[200px]" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">שווי מלאי כולל</p>
                <p className="text-xl font-bold text-cyan-400">₪{fmt(v.totalValue || 0)}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">כמות יחידות</p>
                <p className="text-xl font-bold text-foreground">{(v.totalQty || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">מספר SKU</p>
                <p className="text-xl font-bold text-blue-400">{v.skuCount || 0}</p>
              </CardContent>
            </Card>
            <Card className={`border ${(data?.reorderAlerts || []).length > 0 ? "bg-red-500/10 border-red-500/30" : "bg-slate-900/50 border-slate-700/50"}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">התראות הזמנה מחדש</p>
                <p className={`text-xl font-bold ${(data?.reorderAlerts || []).length > 0 ? "text-red-400" : "text-green-400"}`}>
                  {(data?.reorderAlerts || []).length}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              { id: "overview", label: "סקירה", icon: Package },
              { id: "aging", label: "הזדקנות מלאי", icon: Clock },
              { id: "slow", label: "מלאי איטי", icon: AlertTriangle },
              { id: "dead", label: "מלאי דומם", icon: AlertTriangle },
              { id: "reorder", label: "הזמנה מחדש", icon: AlertTriangle },
              { id: "valuation", label: "שווי לפי קטגוריה", icon: DollarSign },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as InvTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div data-report-content>
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">הזדקנות מלאי (לפי ערך)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={agingChartData} cx="50%" cy="50%" outerRadius={80} dataKey="value">
                        {agingChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [`₪${fmt(Number(v))}`, ""]} />
                      <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">שווי לפי קטגוריית איכות</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 mt-2">
                    {(data?.categoryBreakdown || []).map((c: any, i: number) => {
                      const pct = v.totalValue > 0 ? Math.round((c.value / v.totalValue) * 100) : 0;
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-300">{c.category}</span>
                            <span className="text-foreground">₪{fmt(c.value)} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "aging" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">פירוק הזדקנות מלאי</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={agingChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [`₪${fmt(Number(v))}`, "שווי"]} />
                      <Bar dataKey="value" name="שווי">
                        {agingChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">טבלת הזדקנות</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {agingChartData.map((bucket, i) => {
                      const pct = Math.round((bucket.value / totalAgingValue) * 100);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: bucket.fill }} />
                          <div className="flex-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-300">{bucket.name}</span>
                              <span className="text-foreground font-medium">₪{fmt(bucket.value)}</span>
                            </div>
                            <div className="mt-1 h-1.5 bg-slate-700 rounded-full">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: bucket.fill }} />
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-left">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "slow" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-300">ספי ימי דמיון:</label>
                <select
                  value={slowMovingDays}
                  onChange={e => setSlowMovingDays(parseInt(e.target.value))}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                >
                  {[30, 60, 90, 120, 180, 365].map(d => <option key={d} value={d}>{d} ימים</option>)}
                </select>
              </div>
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    מלאי דומם (לא זז מעל {slowMovingDays} ימים)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(data?.slowMoving || []).length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">אין מלאי דומם בפרמטרים הנבחרים</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-800/60">
                        <tr className="text-muted-foreground text-xs">
                          <th className="text-right py-3 px-4">מזהה חומר</th>
                          <th className="text-right py-3 px-4">כמות</th>
                          <th className="text-right py-3 px-4">עלות יחידה</th>
                          <th className="text-right py-3 px-4">שווי כולל</th>
                          <th className="text-right py-3 px-4">ימים במלאי</th>
                          <th className="text-right py-3 px-4">תאריך קבלה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.slowMoving || []).map((item: any, i: number) => (
                          <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="py-2 px-4 text-foreground">{item.materialId || "—"}</td>
                            <td className="py-2 px-4 text-slate-300">{item.quantity}</td>
                            <td className="py-2 px-4 text-slate-300">₪{fmt(item.unitCost)}</td>
                            <td className="py-2 px-4 text-amber-400 font-medium">₪{fmt(item.totalValue)}</td>
                            <td className="py-2 px-4">
                              <Badge className={`text-[10px] ${item.daysOld > 180 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                                {item.daysOld} ימים
                              </Badge>
                            </td>
                            <td className="py-2 px-4 text-muted-foreground">{item.receivedDate ? new Date(item.receivedDate).toLocaleDateString("he-IL") : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "dead" && (
            <div className="space-y-3">
              <Card className="bg-slate-900/50 border-red-500/20 border">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    מלאי דומם (לא זז מעל 180 ימים) — {(data?.deadStock || []).length} פריטים
                    {(data?.deadStock || []).length > 0 && (
                      <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                        ₪{fmt((data?.deadStock || []).reduce((s: number, i: any) => s + i.totalValue, 0))} בסיכון
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(data?.deadStock || []).length === 0 ? (
                    <div className="py-12 text-center text-green-400 text-sm">✓ אין מלאי דומם</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-800/60">
                        <tr className="text-muted-foreground text-xs">
                          <th className="text-right py-3 px-4">מזהה חומר</th>
                          <th className="text-right py-3 px-4">כמות</th>
                          <th className="text-right py-3 px-4">עלות יחידה</th>
                          <th className="text-right py-3 px-4">שווי כולל</th>
                          <th className="text-right py-3 px-4">ימים במלאי</th>
                          <th className="text-right py-3 px-4">תאריך קבלה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.deadStock || []).map((item: any, i: number) => (
                          <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="py-2 px-4 text-foreground">{item.materialId || "—"}</td>
                            <td className="py-2 px-4 text-slate-300">{item.quantity}</td>
                            <td className="py-2 px-4 text-slate-300">₪{fmt(item.unitCost)}</td>
                            <td className="py-2 px-4 text-red-400 font-medium">₪{fmt(item.totalValue)}</td>
                            <td className="py-2 px-4">
                              <Badge className="text-[10px] bg-red-500/20 text-red-400">{item.daysOld} ימים</Badge>
                            </td>
                            <td className="py-2 px-4 text-muted-foreground">{item.receivedDate ? new Date(item.receivedDate).toLocaleDateString("he-IL") : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "reorder" && (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  פריטים הדורשים הזמנה מחדש ({(data?.reorderAlerts || []).length} פריטים)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(data?.reorderAlerts || []).length === 0 ? (
                  <div className="py-12 text-center text-green-400 text-sm">✓ אין התראות הזמנה מחדש כרגע</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">מזהה חומר</th>
                        <th className="text-right py-3 px-4">כמות נוכחית</th>
                        <th className="text-right py-3 px-4">עלות יחידה</th>
                        <th className="text-right py-3 px-4">פעולה מומלצת</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.reorderAlerts || []).map((item: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{item.materialId || "—"}</td>
                          <td className="py-2 px-4">
                            <Badge className="text-[10px] bg-red-500/20 text-red-400">{item.currentQty}</Badge>
                          </td>
                          <td className="py-2 px-4 text-slate-300">₪{fmt(item.unitCost)}</td>
                          <td className="py-2 px-4 text-amber-400 text-xs">הזמן מחדש</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "valuation" && (
            <div className="space-y-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">שיטת הערכת מלאי</CardTitle>
                    <div className="flex gap-2">
                      {(["weighted_avg", "fifo"] as const).map(method => (
                        <button key={method} onClick={() => setValuationMethod(method)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${valuationMethod === method ? "bg-cyan-500/30 text-cyan-300 border border-cyan-500/40" : "bg-slate-800/50 text-slate-400 border border-slate-700/40 hover:bg-slate-700/50"}`}>
                          {method === "weighted_avg" ? "ממוצע משוקלל" : "FIFO"}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20 md:col-span-1">
                      <p className="text-xs text-muted-foreground">שווי כולל ({valuationMethod === "fifo" ? "FIFO" : "ממוצע משוקלל"})</p>
                      <p className="text-2xl font-bold text-cyan-400">₪{fmt(v.totalValue || 0)}</p>
                    </div>
                    <div className="p-4 bg-slate-800/40 rounded-xl">
                      <p className="text-xs text-muted-foreground">שווי FIFO</p>
                      <p className="text-lg font-bold text-foreground">₪{fmt(v.totalValueFIFO || 0)}</p>
                    </div>
                    <div className="p-4 bg-slate-800/40 rounded-xl">
                      <p className="text-xs text-muted-foreground">שווי ממוצע משוקלל</p>
                      <p className="text-lg font-bold text-foreground">₪{fmt(v.totalValueWeightedAvg || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">שווי לפי קטגוריית איכות</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={(data?.categoryBreakdown || []).map((c: any) => ({ name: c.category, value: c.value }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {(data?.categoryBreakdown || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [`₪${fmt(Number(v))}`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">פרטי שווי מלאי</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4 mt-2">
                    <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                      <p className="text-xs text-muted-foreground">שווי כולל</p>
                      <p className="text-2xl font-bold text-cyan-400">₪{fmt(v.totalValue || 0)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-800/40 rounded-xl">
                        <p className="text-xs text-muted-foreground">סה"כ יחידות</p>
                        <p className="text-lg font-bold text-foreground">{(v.totalQty || 0).toLocaleString()}</p>
                      </div>
                      <div className="p-3 bg-slate-800/40 rounded-xl">
                        <p className="text-xs text-muted-foreground">עלות ממוצעת</p>
                        <p className="text-lg font-bold text-foreground">₪{fmt(v.avgUnitCost || 0)}</p>
                      </div>
                      <div className="p-3 bg-slate-800/40 rounded-xl">
                        <p className="text-xs text-muted-foreground">מספר SKU</p>
                        <p className="text-lg font-bold text-blue-400">{v.skuCount || 0}</p>
                      </div>
                      <div className="p-3 bg-slate-800/40 rounded-xl">
                        <p className="text-xs text-muted-foreground">מלאי דומם</p>
                        <p className="text-lg font-bold text-amber-400">{(data?.slowMoving || []).length}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}
