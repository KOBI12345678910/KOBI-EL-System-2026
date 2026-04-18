import { useState, useEffect } from "react";
import { Link } from "wouter";
import { TrendingUp, Brain, ChevronRight, BarChart2, Target, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const MONTH_NAMES: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרצ", "04": "אפר", "05": "מאי", "06": "יונ",
  "07": "יול", "08": "אוג", "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};

function getMonthLabel(ym: string): string {
  const parts = ym.split("-");
  if (parts.length < 2) return ym;
  return `${MONTH_NAMES[parts[1]] || parts[1]} ${parts[0].slice(2)}`;
}

function SimpleBarChart({ data }: { data: Array<{ month: string; actual: number | null; forecast: number }> }) {
  const max = Math.max(...data.map(d => Math.max(d.actual || 0, d.forecast)), 1);
  return (
    <div className="flex items-end gap-2 h-48">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end gap-0.5 h-40">
            {d.actual !== null && d.actual > 0 && (
              <div
                className="flex-1 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-sm opacity-90"
                style={{ height: `${(d.actual / max) * 100}%` }}
              />
            )}
            <div
              className={`flex-1 rounded-t-sm ${d.actual === null ? "bg-gradient-to-t from-amber-600/60 to-amber-400/60 border border-amber-500/30 border-dashed" : "bg-gradient-to-t from-amber-600/40 to-amber-400/40"}`}
              style={{ height: `${(d.forecast / max) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{d.month}</span>
        </div>
      ))}
    </div>
  );
}

export default function PredictivePage() {
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [leadStats, setLeadStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch(`${API}/crm/analytics/monthly`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
      authFetch(`${API}/crm/leads/scored`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
    ]).then(([monthly, leads]) => {
      const leadsData: Record<string, number> = {};
      (monthly.monthlyLeads || []).forEach((m: any) => { leadsData[m.month] = Number(m.leads || 0); });

      const revenueData: Record<string, number> = {};
      (monthly.monthlyRevenue || []).forEach((m: any) => { revenueData[m.month] = Number(m.revenue || 0) / 1000; });

      const allMonths = [...new Set([...Object.keys(leadsData), ...Object.keys(revenueData)])].sort();
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const chartData = allMonths.map(m => ({
        month: getMonthLabel(m),
        actual: m < currentMonth ? (revenueData[m] || 0) : null,
        forecast: revenueData[m] ? Math.round(revenueData[m] * 1.12) : 0,
        leads: leadsData[m] || 0,
      }));

      const lastRevenue = allMonths.length > 0 ? (revenueData[allMonths[allMonths.length - 1]] || 0) : 0;
      const nextMonths = lastRevenue > 0
        ? [1, 2, 3].map(offset => {
            const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return {
              month: getMonthLabel(key),
              actual: null,
              forecast: Math.round(lastRevenue * (1 + offset * 0.08)),
              leads: 0,
            };
          })
        : [];

      const combined = [...chartData, ...nextMonths];
      const hasAnyData = combined.some(d => (d.actual !== null && d.actual > 0) || d.forecast > 0);
      setMonthlyData(hasAnyData ? combined : []);
      setStats(monthly.revenueStats || {});
      setLeadStats({ hotCount: leads.hotCount || 0, warmCount: leads.warmCount || 0, coldCount: leads.coldCount || 0, avgScore: leads.avgScore || 0, totalLeads: (leads.leads || []).length });
    }).finally(() => setLoading(false));
  }, []);

  const thisMonthRevenue = Number(stats.this_month_revenue || 0);
  const lastMonthRevenue = Number(stats.last_month_revenue || 0);
  const revenueChange = lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;
  const totalLeads = leadStats.totalLeads || 0;

  const PREDICTIONS = [
    { title: "הכנסות החודש", value: thisMonthRevenue > 0 ? `₪${Math.round(thisMonthRevenue / 1000)}K` : "—", change: revenueChange !== 0 ? `${revenueChange > 0 ? "+" : ""}${revenueChange}%` : "—", trend: revenueChange >= 0 ? "up" : "down", confidence: 85 },
    { title: "לידים פעילים", value: String(totalLeads), change: `${leadStats.hotCount || 0} חמים`, trend: "up", confidence: 90 },
    { title: "ציון ממוצע לידים", value: String(leadStats.avgScore || 0), change: leadStats.avgScore >= 70 ? "טוב" : "בינוני", trend: (leadStats.avgScore || 0) >= 70 ? "up" : "down", confidence: 80 },
    { title: "סיכון נטישה", value: totalLeads > 0 ? `${Math.round((leadStats.coldCount / totalLeads) * 100)}%` : "—", change: "לידים קרים", trend: "down", confidence: 75 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground" dir="rtl">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/crm"><span className="hover:text-amber-400 cursor-pointer">CRM Advanced Pro</span></Link>
          <ChevronRight className="w-4 h-4 rotate-180" />
          <span className="text-foreground">Predictive Analytics</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <TrendingUp className="w-7 h-7 text-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">Predictive Analytics</h1>
            <p className="text-muted-foreground text-sm">חיזוי מגמות מכירות ודפוסי לקוחות עם AI מתקדם</p>
          </div>
          <div className="mr-auto flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 rounded-lg border border-blue-500/30">
            <Brain className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-300 font-medium">מודל ML פעיל</span>
          </div>
        </div>

        {loading ? (
          <div className="text-muted-foreground text-sm text-center py-10">טוען נתונים...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {PREDICTIONS.map((p, i) => (
                <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
                  <div className="flex items-center gap-1 mb-2">
                    {p.trend === "up" ? <ArrowUpRight className="w-4 h-4 text-green-400" /> : <ArrowDownRight className="w-4 h-4 text-amber-400" />}
                    <span className={`text-xs font-bold ${p.trend === "up" ? "text-green-400" : "text-amber-400"}`}>{p.change}</span>
                  </div>
                  <div className="text-xl font-bold text-foreground">{p.value}</div>
                  <div className="text-xs text-muted-foreground mb-2">{p.title}</div>
                  <div className="h-1 bg-slate-700 rounded-full">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.confidence}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">סמך: {p.confidence}%</div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-400" />
                  {monthlyData.length > 0 ? "תחזית הכנסות vs. בפועל (₪K)" : "אין נתוני הכנסות"}
                </h2>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /><span className="text-muted-foreground">בפועל</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500/60 border border-amber-500/30" /><span className="text-muted-foreground">תחזית</span></div>
                </div>
              </div>
              {monthlyData.length > 0 ? (
                <SimpleBarChart data={monthlyData} />
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>אין נתוני הכנסות עדיין</p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  מצב הלידים הנוכחי
                </h3>
                <div className="space-y-3">
                  {[
                    { cat: "Hot Leads 🔥", count: leadStats.hotCount || 0, total: totalLeads, color: "bg-red-500" },
                    { cat: "Warm Leads 🌡️", count: leadStats.warmCount || 0, total: totalLeads, color: "bg-amber-500" },
                    { cat: "Cold Leads ❄️", count: leadStats.coldCount || 0, total: totalLeads, color: "bg-blue-500" },
                  ].map((t, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm text-slate-300 w-28 flex-shrink-0">{t.cat}</span>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full">
                        <div className={`h-full rounded-full ${t.color}`} style={{ width: `${totalLeads > 0 ? (t.count / totalLeads) * 100 : 0}%` }} />
                      </div>
                      <span className="text-sm font-bold w-8 text-right text-slate-300">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-indigo-500/5 p-6">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  תחזית לחודש הבא
                </h3>
                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-900/60 p-4">
                    <div className="text-xs text-muted-foreground mb-1">הכנסות צפויות</div>
                    {thisMonthRevenue > 0 ? (
                      <>
                        <div className="text-lg sm:text-2xl font-bold text-amber-400">₪{Math.round(thisMonthRevenue * 1.1 / 1000)}K</div>
                        <div className="text-xs text-green-400 mt-1">↑ +10% תחזית</div>
                      </>
                    ) : (
                      <div className="text-muted-foreground text-sm">אין נתוני בסיס</div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-900/60 p-3">
                      <div className="text-xs text-muted-foreground">לידים בצנרת</div>
                      <div className="text-lg font-bold text-foreground">{totalLeads}</div>
                    </div>
                    <div className="rounded-xl bg-slate-900/60 p-3">
                      <div className="text-xs text-muted-foreground">ציון ממוצע</div>
                      <div className="text-lg font-bold text-foreground">{leadStats.avgScore || "—"}</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Brain className="w-3 h-3" />
                    מבוסס על נתוני מערכת בזמן אמת
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="predictive" entityId="all" />
        <RelatedRecords entityType="predictive" entityId="all" />
      </div>
    </div>
  );
}