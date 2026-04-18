import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingDown, Clock, DollarSign, ChevronLeft, Calendar } from "lucide-react";
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
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

type HRTab = "overview" | "headcount" | "turnover" | "overtime" | "leave" | "absence" | "cost";

export default function BIHRAnalytics() {
  const [activeTab, setActiveTab] = useState<HRTab>("overview");
  const pf = usePeriodFilter();

  const { data, isLoading } = useQuery({
    queryKey: ["bi-hr", ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/hr?${pf.buildQueryParams()}`).catch(() => null),
  });

  const s = data?.summary || {};
  const headcountData = (data?.headcountByDept || []).slice(0, 8);
  const costData = (data?.laborCostByDept || []).slice(0, 8);
  const leaveData = data?.leaveBreakdown || [];
  const overtimeData = data?.overtimeByDept || [];
  const turnover = data?.turnoverData || {};
  const absenceTrend = (data?.absenceTrend || []).filter((m: any) => m.total > 0);

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports"><span className="flex items-center gap-1 hover:text-foreground cursor-pointer"><ChevronLeft className="w-4 h-4" />מרכז דוחות</span></Link>
        <span>/</span>
        <span className="text-foreground">ניתוח משאבי אנוש</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-pink-400" /> ניתוח משאבי אנוש — BI
        </h1>
        <p className="text-sm text-muted-foreground mt-1">ראשי, תחלופה, עדרות, שעות נוספות ועלויות שכר לפי מחלקה</p>
      </div>

      <PeriodFilter
        period={pf.period} onPeriodChange={pf.setPeriod}
        year={pf.year} onYearChange={pf.setYear}
        month={pf.month} onMonthChange={pf.setMonth}
        quarter={pf.quarter} onQuarterChange={pf.setQuarter}
        customStart={pf.customStart} onCustomStartChange={pf.setCustomStart}
        customEnd={pf.customEnd} onCustomEndChange={pf.setCustomEnd}
        onExportCSV={() => exportCSV(data?.headcountByDept || [], `hr-headcount-${pf.year}.csv`)}
        onExportPDF={() => exportPDF("ניתוח משאבי אנוש — ראשי, תחלופה, עדרות, שעות נוספות")}
      />

      {isLoading ? (
        <LoadingOverlay className="min-h-[200px]" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "כוח אדם פעיל", value: s.totalHeadcount || 0, sub: `${s.newHires || 0} גיוסים חדשים`, color: "text-pink-400", isCount: true },
              { label: "שיעור תחלופה", value: (s.turnoverRate || 0).toFixed(1) + "%", sub: `${s.separations || 0} עזבו`, color: s.turnoverRate > 10 ? "text-red-400" : "text-green-400", isStat: true },
              { label: "שיעור עדרות", value: (s.absenceRate || 0).toFixed(1) + "%", sub: "מרשומות נוכחות", color: s.absenceRate > 5 ? "text-orange-400" : "text-green-400", isStat: true },
              { label: "סה\"כ שעות נוספות", value: s.totalOvertimeHours || 0, sub: "שעות בתקופה", color: "text-amber-400", isCount: true, unit: " ש'" },
            ].map((c, i) => (
              <Card key={i} className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className={`text-xl font-bold ${c.color}`}>
                    {c.isStat ? c.value : c.isCount ? `${(c.value as number).toLocaleString()}${c.unit || ""}` : c.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              { id: "overview", label: "סקירה", icon: Users },
              { id: "headcount", label: "כוח אדם", icon: Users },
              { id: "turnover", label: "תחלופה", icon: TrendingDown },
              { id: "overtime", label: "שעות נוספות", icon: Clock },
              { id: "leave", label: "חופשות ומחלה", icon: Clock },
              { id: "absence", label: "מגמת עדרות", icon: Calendar },
              { id: "cost", label: "עלויות שכר", icon: DollarSign },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as HRTab)}
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
                <CardHeader><CardTitle className="text-sm">כוח אדם לפי מחלקה</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={headcountData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis type="category" dataKey="department" tick={{ fill: "#94a3b8", fontSize: 10 }} width={80} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Bar dataKey="headcount" name="עובדים" fill="#ec4899" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">סוגי היעדרויות</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={leaveData.map((l: any) => ({ name: l.leaveType || "אחר", value: l.count }))} cx="50%" cy="50%" outerRadius={80} dataKey="value">
                        {leaveData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "headcount" && (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60">
                    <tr className="text-muted-foreground text-xs">
                      <th className="text-right py-3 px-4">מחלקה</th>
                      <th className="text-right py-3 px-4">עובדים</th>
                      <th className="text-right py-3 px-4">עלות שכר</th>
                      <th className="text-right py-3 px-4">עלות לעובד</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.headcountByDept || []).map((d: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 px-4 text-foreground">{d.department}</td>
                        <td className="py-2 px-4">
                          <Badge className="bg-pink-500/20 text-pink-400 text-[10px]">{d.headcount}</Badge>
                        </td>
                        <td className="py-2 px-4 text-blue-400 font-medium">₪{fmt(d.salaryCost)}</td>
                        <td className="py-2 px-4 text-slate-300">₪{fmt(d.headcount > 0 ? d.salaryCost / d.headcount : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {activeTab === "turnover" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">נתוני תחלופה</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4 mt-2">
                    <div className={`p-5 rounded-xl text-center border ${(turnover.turnoverRate || 0) > 10 ? "bg-red-500/10 border-red-500/20" : "bg-green-500/10 border-green-500/20"}`}>
                      <p className={`text-4xl font-bold ${(turnover.turnoverRate || 0) > 10 ? "text-red-400" : "text-green-400"}`}>
                        {(turnover.turnoverRate || 0).toFixed(1)}%
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">שיעור תחלופה</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "עובדים פעילים", value: turnover.active || 0, color: "text-green-400" },
                        { label: "עזבו בתקופה", value: turnover.separations || 0, color: "text-red-400" },
                        { label: "גיוסים חדשים", value: turnover.newHires || 0, color: "text-blue-400" },
                        { label: "נטו שינוי", value: (turnover.newHires || 0) - (turnover.separations || 0), color: ((turnover.newHires || 0) - (turnover.separations || 0)) >= 0 ? "text-green-400" : "text-red-400" },
                      ].map((item, i) => (
                        <div key={i} className="p-3 bg-slate-800/40 rounded-xl text-center">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className={`text-xl font-bold ${item.color}`}>{item.value > 0 ? "+" : ""}{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">פירוק כוח אדם</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "פעיל", value: turnover.active || 0 },
                          { name: "עזבו", value: turnover.terminated || 0 },
                        ]}
                        cx="50%" cy="50%" outerRadius={80} dataKey="value"
                        label={({ name, value }: any) => `${name}: ${value}`}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "overtime" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">שעות נוספות לפי מחלקה</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={overtimeData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis type="category" dataKey="department" tick={{ fill: "#94a3b8", fontSize: 10 }} width={80} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [v + " שעות", "שעות נוספות"]} />
                      <Bar dataKey="overtimeHours" name="שעות נוספות" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">מחלקה</th>
                        <th className="text-right py-3 px-4">שעות נוספות</th>
                        <th className="text-right py-3 px-4">עובדים מעורבים</th>
                        <th className="text-right py-3 px-4">ממוצע לעובד</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overtimeData.map((d: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{d.department}</td>
                          <td className="py-2 px-4 text-amber-400 font-medium">{d.overtimeHours.toFixed(1)} ש'</td>
                          <td className="py-2 px-4 text-slate-300">{d.employees}</td>
                          <td className="py-2 px-4 text-slate-300">{d.employees > 0 ? (d.overtimeHours / d.employees).toFixed(1) : 0} ש'</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "leave" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">ימי היעדרות לפי סוג</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={leaveData.map((l: any) => ({ name: l.leaveType || "אחר", days: l.totalDays, count: l.count }))} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} angle={-30} textAnchor="end" />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Bar dataKey="days" name="ימים" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">סוג היעדרות</th>
                        <th className="text-right py-3 px-4">מספר בקשות</th>
                        <th className="text-right py-3 px-4">סה"כ ימים</th>
                        <th className="text-right py-3 px-4">ממוצע לבקשה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveData.map((l: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{l.leaveType || "אחר"}</td>
                          <td className="py-2 px-4 text-slate-300">{l.count}</td>
                          <td className="py-2 px-4 text-purple-400 font-medium">{l.totalDays} ימים</td>
                          <td className="py-2 px-4 text-slate-300">{l.count > 0 ? (l.totalDays / l.count).toFixed(1) : 0} ימים</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "absence" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">שיעור עדרות כולל</p>
                    <p className="text-xl font-bold text-orange-400">{s.absenceRate || 0}%</p>
                    <p className="text-xs text-muted-foreground mt-1">מרשומות נוכחות</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">חודשים עם נתונים</p>
                    <p className="text-xl font-bold text-foreground">{absenceTrend.length}</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">שיעור עדרות מרבי</p>
                    <p className="text-xl font-bold text-red-400">
                      {absenceTrend.length > 0 ? Math.max(...absenceTrend.map((m: any) => m.rate)) : 0}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">מגמת עדרות חודשית (%)</CardTitle></CardHeader>
                <CardContent>
                  {absenceTrend.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">אין נתוני נוכחות בתקופה הנבחרת</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={absenceTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} unit="%" />
                        <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [`${v}%`, "שיעור עדרות"]} />
                        <Line type="monotone" dataKey="rate" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 4 }} name="שיעור עדרות %" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">שעות נוספות חודשיות</CardTitle></CardHeader>
                <CardContent>
                  {absenceTrend.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">אין נתונים</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={absenceTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [`${v} שעות`, "שעות נוספות"]} />
                        <Bar dataKey="overtime" name="שעות נוספות" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "cost" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader><CardTitle className="text-sm">עלות שכר לפי מחלקה</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costData} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="department" tick={{ fill: "#94a3b8", fontSize: 10 }} width={90} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} formatter={(v: any) => [`₪${fmt(Number(v))}`, ""]} />
                      <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
                      <Bar dataKey="salaryCost" name="שכר" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="benefitsCost" name="הטבות" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr className="text-muted-foreground text-xs">
                        <th className="text-right py-3 px-4">מחלקה</th>
                        <th className="text-right py-3 px-4">עובדים</th>
                        <th className="text-right py-3 px-4">שכר</th>
                        <th className="text-right py-3 px-4">הטבות</th>
                        <th className="text-right py-3 px-4">סה"כ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costData.map((d: any, i: number) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-4 text-foreground">{d.department}</td>
                          <td className="py-2 px-4 text-slate-300">{d.headcount}</td>
                          <td className="py-2 px-4 text-blue-400">₪{fmt(d.salaryCost)}</td>
                          <td className="py-2 px-4 text-green-400">₪{fmt(d.benefitsCost)}</td>
                          <td className="py-2 px-4 font-medium text-foreground">₪{fmt(d.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-800/60">
                      <tr className="text-xs font-bold">
                        <td className="py-3 px-4 text-foreground" colSpan={2}>סה"כ</td>
                        <td className="py-3 px-4 text-blue-400">₪{fmt(costData.reduce((s: number, d: any) => s + d.salaryCost, 0))}</td>
                        <td className="py-3 px-4 text-green-400">₪{fmt(costData.reduce((s: number, d: any) => s + d.benefitsCost, 0))}</td>
                        <td className="py-3 px-4 text-foreground">₪{fmt(costData.reduce((s: number, d: any) => s + d.totalCost, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
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
