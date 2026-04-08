import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Users, Package, UserCheck, TrendingUp, ChevronLeft, ArrowUpRight, ArrowDownRight, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
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
const fmtSign = (v: number) => (v < 0 ? "-" : "") + "₪" + fmt(v);
const pct = (v: number) => (v > 0 ? "+" : "") + v.toFixed(1) + "%";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

const MONTH_HE = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];

type SalesTab = "overview" | "customers" | "products" | "salesperson" | "territory";

export default function BISalesAnalytics() {
  const [activeTab, setActiveTab] = useState<SalesTab>("overview");
  const pf = usePeriodFilter();

  const { data, isLoading } = useQuery({
    queryKey: ["bi-sales", ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/sales?${pf.buildQueryParams()}`).catch(() => null),
  });

  const s = data?.summary || {};
  const monthly = (data?.monthlyTrend || []).map((m: any, i: number) => ({
    ...m,
    name: MONTH_HE[m.month - 1] || `${m.month}`,
  }));

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports"><span className="flex items-center gap-1 hover:text-foreground cursor-pointer"><ChevronLeft className="w-4 h-4" />מרכז דוחות</span></Link>
        <span>/</span>
        <span className="text-foreground">ניתוח מכירות</span>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-blue-400" /> ניתוח מכירות — BI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מכירות לפי לקוח, מוצר, נציג מכירות ומגמות לאורך זמן</p>
        </div>
      </div>

      <PeriodFilter
        period={pf.period} onPeriodChange={pf.setPeriod}
        year={pf.year} onYearChange={pf.setYear}
        month={pf.month} onMonthChange={pf.setMonth}
        quarter={pf.quarter} onQuarterChange={pf.setQuarter}
        customStart={pf.customStart} onCustomStartChange={pf.setCustomStart}
        customEnd={pf.customEnd} onCustomEndChange={pf.setCustomEnd}
        onExportCSV={() => exportCSV(data?.byCustomer || [], `sales-customers-${pf.year}.csv`)}
        onExportPDF={() => exportPDF("ניתוח מכירות — לקוחות, מוצרים, נציגים, טריטוריה")}
      />

      {isLoading ? (
        <LoadingOverlay className="min-h-[200px]" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "סה\"כ הכנסות", value: s.totalRevenue || 0, change: s.yoyGrowth, color: "text-green-400" },
              { label: "מספר חשבוניות", value: s.invoiceCount || 0, isCount: true, color: "text-blue-400" },
              { label: "עסקה ממוצעת", value: s.avgDealSize || 0, color: "text-amber-400" },
              { label: "הזמנות מכירה", value: s.totalOrders || 0, isCount: true, color: "text-purple-400" },
            ].map((card, i) => (
              <Card key={i} className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-xl font-bold ${card.color}`}>
                    {card.isCount ? (card.value as number).toLocaleString() : `₪${fmt(card.value as number)}`}
                  </p>
                  {card.change !== undefined && (
                    <div className="flex items-center gap-1 mt-1">
                      {card.change >= 0 ? <ArrowUpRight className="w-3 h-3 text-green-400" /> : <ArrowDownRight className="w-3 h-3 text-red-400" />}
                      <span className={`text-xs ${card.change >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(card.change)} YoY</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              { id: "overview", label: "סקירה", icon: TrendingUp },
              { id: "customers", label: "לפי לקוח", icon: Users },
              { id: "products", label: "לפי מוצר", icon: Package },
              { id: "salesperson", label: "לפי נציג", icon: UserCheck },
              { id: "territory", label: "לפי טריטוריה", icon: MapPin },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SalesTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div data-report-content>
          {activeTab === "overview" && (
            <div className="space-y-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader>
                  <CardTitle className="text-sm">מגמת הכנסות חודשית</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthly.filter((m: any) => m.revenue > 0)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                        formatter={(v: any) => [`₪${fmt(Number(v))}`, "הכנסות"]}
                      />
                      <Bar dataKey="revenue" name="הכנסות" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader><CardTitle className="text-sm">TOP 5 לקוחות</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(data?.byCustomer || []).slice(0, 5).map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-700 text-xs text-muted-foreground">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-foreground truncate">{c.name}</span>
                              <span className="text-blue-400 font-medium shrink-0 mr-2">₪{fmt(c.revenue)}</span>
                            </div>
                            <div className="mt-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.share}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader><CardTitle className="text-sm">TOP 5 מוצרים</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={(data?.byProduct || []).slice(0, 5).map((p: any) => ({ name: p.name, value: p.revenue }))}
                          cx="50%" cy="50%" outerRadius={70} dataKey="value"
                        >
                          {(data?.byProduct || []).slice(0, 5).map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                          formatter={(v: any) => [`₪${fmt(Number(v))}`, ""]}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "customers" && (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60">
                    <tr className="text-muted-foreground text-xs">
                      <th className="text-right py-3 px-4">#</th>
                      <th className="text-right py-3 px-4">לקוח</th>
                      <th className="text-right py-3 px-4">הכנסות</th>
                      <th className="text-right py-3 px-4">חשבוניות</th>
                      <th className="text-right py-3 px-4">נתח</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byCustomer || []).map((c: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 px-4 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 px-4 text-foreground">{c.name}</td>
                        <td className="py-2 px-4 text-blue-400 font-medium">₪{fmt(c.revenue)}</td>
                        <td className="py-2 px-4 text-slate-300">{c.invoices}</td>
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(c.share, 100)}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{c.share}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {activeTab === "products" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">הכנסות לפי מוצר</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={(data?.byProduct || []).slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={80} />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                        formatter={(v: any) => [`₪${fmt(Number(v))}`, "הכנסות"]}
                      />
                      <Bar dataKey="revenue" name="הכנסות" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">מוצר</th>
                        <th className="text-right py-3 px-4">הכנסות</th>
                        <th className="text-right py-3 px-4">חשבוניות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.byProduct || []).map((p: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{p.name}</td>
                          <td className="py-2 px-4 text-green-400 font-medium">₪{fmt(p.revenue)}</td>
                          <td className="py-2 px-4 text-slate-300">{p.invoices}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "salesperson" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">ביצועי נציגי מכירות</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={(data?.bySalesperson || []).slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={90} />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                        formatter={(v: any) => [`₪${fmt(Number(v))}`, "הכנסות"]}
                      />
                      <Bar dataKey="revenue" name="הכנסות" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">נציג</th>
                        <th className="text-right py-3 px-4">הכנסות</th>
                        <th className="text-right py-3 px-4">חשבוניות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.bySalesperson || []).map((sp: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{sp.name}</td>
                          <td className="py-2 px-4 text-purple-400 font-medium">₪{fmt(sp.revenue)}</td>
                          <td className="py-2 px-4 text-slate-300">{sp.invoices}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "territory" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">הכנסות לפי אזור גיאוגרפי</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={(data?.byTerritory || []).slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="territory" tick={{ fill: "#94a3b8", fontSize: 10 }} width={100} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [`₪${fmt(Number(v))}`, "הכנסות"]} />
                      <Bar dataKey="revenue" name="הכנסות" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">#</th>
                        <th className="text-right py-3 px-4">טריטוריה</th>
                        <th className="text-right py-3 px-4">לקוחות</th>
                        <th className="text-right py-3 px-4">הכנסות</th>
                        <th className="text-right py-3 px-4">נתח שוק</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.byTerritory || []).map((t: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 px-4 text-foreground">{t.territory}</td>
                          <td className="py-2 px-4 text-slate-300">{t.customers}</td>
                          <td className="py-2 px-4 text-cyan-400 font-medium">₪{fmt(t.revenue)}</td>
                          <td className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-700 rounded-full">
                                <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${t.share}%` }} />
                              </div>
                              <span className="text-xs text-cyan-400">{t.share}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "salesperson" && (data?.bottomSalesperson || []).length > 0 && (
            <Card className="bg-slate-900/50 border-amber-600/20 border mt-4">
              <CardHeader><CardTitle className="text-sm text-amber-400">נציגי מכירות - ביצועים נמוכים</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-2 px-4">נציג</th>
                        <th className="text-right py-2 px-4">הכנסות</th>
                        <th className="text-right py-2 px-4">חשבוניות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.bottomSalesperson || []).map((sp: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{sp.name}</td>
                          <td className="py-2 px-4 text-amber-400 font-medium">₪{fmt(sp.revenue)}</td>
                          <td className="py-2 px-4 text-slate-300">{sp.invoices}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "customers" && (data?.bottomCustomers || []).length > 0 && (
            <Card className="bg-slate-900/50 border-amber-600/20 border mt-4">
              <CardHeader><CardTitle className="text-sm text-amber-400">לקוחות - ביצועים נמוכים</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-2 px-4">לקוח</th>
                        <th className="text-right py-2 px-4">הכנסות</th>
                        <th className="text-right py-2 px-4">חשבוניות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.bottomCustomers || []).map((c: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{c.name}</td>
                          <td className="py-2 px-4 text-amber-400 font-medium">₪{fmt(c.revenue)}</td>
                          <td className="py-2 px-4 text-slate-300">{c.invoices}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "products" && (data?.bottomProducts || []).length > 0 && (
            <Card className="bg-slate-900/50 border-amber-600/20 border mt-4">
              <CardHeader><CardTitle className="text-sm text-amber-400">מוצרים - ביצועים נמוכים</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-2 px-4">מוצר</th>
                        <th className="text-right py-2 px-4">הכנסות</th>
                        <th className="text-right py-2 px-4">חשבוניות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.bottomProducts || []).map((p: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{p.name}</td>
                          <td className="py-2 px-4 text-amber-400 font-medium">₪{fmt(p.revenue)}</td>
                          <td className="py-2 px-4 text-slate-300">{p.invoices}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          </div>
        </>
      )}
    </div>
  );
}
