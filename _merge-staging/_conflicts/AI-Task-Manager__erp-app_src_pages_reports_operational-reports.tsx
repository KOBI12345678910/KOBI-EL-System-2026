import { LoadingOverlay } from "@/components/ui/unified-states";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity, ChevronLeft, Database, CheckSquare,
  Clock, Users, BarChart3, Edit, Plus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from "recharts";
import PeriodFilter, { usePeriodFilter, exportPDF } from "./components/period-filter";

const API = "/api";

const ACTION_LABELS: Record<string, string> = {
  create: "יצירה",
  update: "עדכון",
  delete: "מחיקה",
  approve: "אישור",
  reject: "דחייה",
  login: "התחברות",
};

const ACTION_COLORS: Record<string, string> = {
  create: "#10b981",
  update: "#3b82f6",
  delete: "#ef4444",
  approve: "#f59e0b",
  reject: "#f97316",
  login: "#8b5cf6",
};

export default function OperationalReports() {
  const pf = usePeriodFilter();

  const { data, isLoading } = useQuery({
    queryKey: ["operational-reports", ...pf.queryKey],
    queryFn: async () => {
      try {
        return await authJson(`${API}/reports-center/operational?${pf.buildQueryParams()}`);
      } catch {
        return {};
      }
    },
  });

  const recordsByModule = data?.recordsByModule || [];
  const recentActivity = data?.recentActivity || [];
  const approvals = data?.approvals || {};
  const activityByType = data?.activityByType || [];

  const totalCreated = recordsByModule.reduce((s: number, r: any) => s + (r.created || 0), 0);
  const totalUpdated = recordsByModule.reduce((s: number, r: any) => s + (r.updated || 0), 0);

  function exportCSV() {
    let csv = "\uFEFF";
    csv += "מודול,סה״כ רשומות,נוצרו בתקופה,עודכנו בתקופה\n";
    recordsByModule.forEach((r: any) => { csv += `${r.module},${r.total},${r.created},${r.updated}\n`; });
    csv += "\nפעולה,כמות\n";
    activityByType.forEach((a: any) => { csv += `${ACTION_LABELS[a.action] || a.action},${a.count}\n`; });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "operational-report.csv";
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
        <span className="text-foreground">דוחות תפעוליים</span>
      </div>

      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="w-6 h-6 text-amber-400" /> דוחות תפעוליים
        </h1>
        <p className="text-muted-foreground mt-1">סקירת פעילות מערכת, ביצועי מודולים ומשימות פתוחות {data?.periodLabel ? `— ${data.periodLabel}` : ""}</p>
      </div>

      <PeriodFilter
        period={pf.period} onPeriodChange={pf.setPeriod}
        year={pf.year} onYearChange={pf.setYear}
        month={pf.month} onMonthChange={pf.setMonth}
        quarter={pf.quarter} onQuarterChange={pf.setQuarter}
        customStart={pf.customStart} onCustomStartChange={pf.setCustomStart}
        customEnd={pf.customEnd} onCustomEndChange={pf.setCustomEnd}
        onExportCSV={exportCSV}
        onExportPDF={() => exportPDF("דוחות תפעוליים")}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <Database className="w-5 h-5 text-blue-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{recordsByModule.reduce((s: number, r: any) => s + r.total, 0)}</p>
            <p className="text-xs text-blue-400/70">סה״כ רשומות</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <Plus className="w-5 h-5 text-green-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{totalCreated}</p>
            <p className="text-xs text-green-400/70">נוצרו בתקופה</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
          <CardContent className="p-4">
            <Edit className="w-5 h-5 text-cyan-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{totalUpdated}</p>
            <p className="text-xs text-cyan-400/70">עודכנו בתקופה</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4">
            <CheckSquare className="w-5 h-5 text-amber-400 mb-1" />
            <p className="text-lg font-bold text-foreground">{approvals.pending || 0}</p>
            <p className="text-xs text-amber-400/70">אישורים ממתינים</p>
          </CardContent>
        </Card>
      </div>

      <div data-report-content>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" /> פעילות לפי מודול
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recordsByModule.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={recordsByModule} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                    <YAxis dataKey="module" type="category" stroke="#94a3b8" fontSize={11} width={120} />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }} />
                    <Legend />
                    <Bar dataKey="created" fill="#10b981" radius={[0, 4, 4, 0]} name="נוצרו" />
                    <Bar dataKey="updated" fill="#3b82f6" radius={[0, 4, 4, 0]} name="עודכנו" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">אין נתוני מודולים</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400" /> פילוח פעולות בתקופה
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityByType.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={activityByType.map((a: any) => ({ name: ACTION_LABELS[a.action] || a.action, value: a.count }))}
                        cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name"
                        label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {activityByType.map((a: any, idx: number) => (
                          <Cell key={idx} fill={ACTION_COLORS[a.action] || "#64748b"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {activityByType.map((a: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-800/30">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ACTION_COLORS[a.action] || "#64748b" }} />
                          <span className="text-sm text-slate-300">{ACTION_LABELS[a.action] || a.action}</span>
                        </div>
                        <span className="text-sm font-medium text-foreground">{a.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">אין נתוני פעולות</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-amber-400" /> אישורים ומשימות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-amber-500/10 text-center">
                  <p className="text-lg sm:text-2xl font-bold text-amber-400">{approvals.pending || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">ממתינים</p>
                </div>
                <div className="p-4 rounded-xl bg-green-500/10 text-center">
                  <p className="text-lg sm:text-2xl font-bold text-green-400">{approvals.approved || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">אושרו</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/10 text-center">
                  <p className="text-lg sm:text-2xl font-bold text-muted-foreground">{approvals.total || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">סה״כ</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <p className="text-sm font-medium text-foreground mb-3">סיכום רשומות לפי מודול</p>
                <div className="space-y-2">
                  {recordsByModule.map((r: any, idx: number) => {
                    const maxTotal = Math.max(...recordsByModule.map((m: any) => m.total), 1);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-300">{r.module}</span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-green-400">+{r.created}</span>
                            <span className="text-blue-400">~{r.updated}</span>
                            <span className="text-muted-foreground">/ {r.total}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.total / maxTotal) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" /> פעילות אחרונה (Audit Log)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {recentActivity.map((activity: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/20 hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${
                          activity.action === "create" ? "bg-green-500/20 text-green-400" :
                          activity.action === "update" ? "bg-blue-500/20 text-blue-400" :
                          activity.action === "delete" ? "bg-red-500/20 text-red-400" :
                          "bg-muted/20 text-muted-foreground"
                        }`}>
                          {ACTION_LABELS[activity.action] || activity.action}
                        </Badge>
                        <span className="text-xs text-slate-300">{activity.entityType}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />
                        <span>{activity.userName || "—"}</span>
                        <span>{activity.createdAt ? new Date(activity.createdAt).toLocaleString("he-IL") : ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">אין פעילות אחרונה</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="operational" entityId="all" />
        <RelatedRecords entityType="operational" entityId="all" />
      </div>
    </div>
  );
}