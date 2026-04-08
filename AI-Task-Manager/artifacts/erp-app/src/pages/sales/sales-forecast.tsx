import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import {
  TrendingUp, DollarSign, Target, BarChart3, Calendar, RefreshCw, ChevronDown, CheckCircle2
} from "lucide-react";

const API = "/api";
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtPct = (n: any) => `${Number(n || 0).toFixed(1)}%`;

const PERIOD_OPTIONS = [
  { value: "weekly", label: "שבועי" },
  { value: "monthly", label: "חודשי" },
  { value: "quarterly", label: "רבעוני" },
];

function formatPeriod(p: string, period: string) {
  if (!p) return "—";
  const d = new Date(p);
  if (period === "weekly") return `שבוע ${d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}`;
  if (period === "quarterly") {
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `Q${q} ${d.getFullYear()}`;
  }
  return d.toLocaleDateString("he-IL", { year: "numeric", month: "long" });
}

export default function SalesForecast() {
  const [period, setPeriod] = useState("monthly");
  const [data, setData] = useState<any>({ forecast: [], summary: {}, wonHistory: [], forecastAccuracy: [] });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    authFetch(`${API}/sales/forecast?period=${period}`)
      .then(r => r.json())
      .then(d => setData(d || {}))
      .catch(() => setData({ forecast: [], summary: {}, wonHistory: [], forecastAccuracy: [] }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [period]);

  const maxWeighted = useMemo(() => Math.max(...(data.forecast || []).map((r: any) => Number(r.weighted_value || 0)), 1), [data.forecast]);

  const summary = data.summary || {};

  const kpis = [
    { label: "צנרת כוללת", value: fmtC(summary.total_pipeline), icon: DollarSign, color: "text-blue-400" },
    { label: "ערך משוקלל", value: fmtC(summary.weighted_pipeline), icon: TrendingUp, color: "text-green-400" },
    { label: "עסקאות פעילות", value: fmt(summary.active_deals), icon: Target, color: "text-purple-400" },
    { label: "סבירות ממוצעת", value: fmtPct(summary.avg_probability), icon: BarChart3, color: "text-amber-400" },
  ];

  const avgAccuracy = useMemo(() => {
    const acc = (data.forecastAccuracy || []).filter((r: any) => r.accuracy_pct !== null);
    if (acc.length === 0) return null;
    return acc.reduce((s: number, r: any) => s + Number(r.accuracy_pct), 0) / acc.length;
  }, [data.forecastAccuracy]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-400" />
            תחזית מכירות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח תחזית הכנסות לפי תקופה עם ערכים משוקללים והשוואת דיוק</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm appearance-none pr-8"
            >
              {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute left-2 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          <button onClick={load} className="flex items-center gap-1.5 bg-card border border-border px-3 py-2.5 rounded-xl text-sm hover:bg-muted">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            רענן
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="bg-card border border-border/50 rounded-2xl p-4">
            <k.icon className={`${k.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-400" />
          תחזית לפי תקופה
        </h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-4">
                <div className="w-24 h-4 bg-muted/30 rounded" />
                <div className="flex-1 h-6 bg-muted/30 rounded" />
                <div className="w-20 h-4 bg-muted/30 rounded" />
              </div>
            ))}
          </div>
        ) : (data.forecast || []).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>אין נתוני תחזית — הוסף הזדמנויות עם תאריכי סגירה צפויים</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(data.forecast || []).map((row: any, i: number) => {
              const weighted = Number(row.weighted_value || 0);
              const pct = maxWeighted > 0 ? (weighted / maxWeighted) * 100 : 0;
              const confidence = Math.min(100, Math.round(Number(row.avg_probability || 0)));
              return (
                <div key={i} className="grid grid-cols-12 gap-3 items-center text-sm">
                  <div className="col-span-2 font-medium text-muted-foreground">{formatPeriod(row.period, period)}</div>
                  <div className="col-span-5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted/20 rounded-full h-6 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500/80 to-blue-400/60 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 text-right font-bold text-foreground">{fmtC(weighted)}</div>
                  <div className="col-span-1 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${confidence >= 70 ? "bg-green-500/20 text-green-400" : confidence >= 40 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                      {confidence}%
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-muted-foreground text-xs">{fmt(row.deal_count)} עסקאות</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="font-semibold mb-4">השוואה: ערך גולמי מול ערך משוקלל</h2>
          <div className="space-y-2">
            {(data.forecast || []).slice(0, 8).map((row: any, i: number) => {
              const total = Number(row.total_value || 0);
              const weighted = Number(row.weighted_value || 0);
              const ratio = total > 0 ? (weighted / total) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-20 text-muted-foreground text-xs">{formatPeriod(row.period, period)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-blue-400">גולמי: {fmtC(total)}</span>
                      <span className="text-green-400">משוקלל: {fmtC(weighted)}</span>
                    </div>
                    <div className="bg-muted/20 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500/60 rounded-full" style={{ width: "100%" }} />
                    </div>
                    <div className="bg-muted/20 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500/60 rounded-full" style={{ width: `${ratio}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="font-semibold mb-4">היסטוריית עסקאות שנסגרו</h2>
          {(data.wonHistory || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">אין נתוני עסקאות שנסגרו עדיין</div>
          ) : (
            <div className="space-y-2">
              {(data.wonHistory || []).slice(0, 8).map((row: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-border/20">
                  <span className="text-muted-foreground">{formatPeriod(row.period, period)}</span>
                  <span className="text-green-400 font-bold">{fmtC(row.revenue_won)}</span>
                  <span className="text-xs text-muted-foreground">{fmt(row.deals_won)} עסקאות</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Forecast Accuracy Section */}
      <div className="bg-card border border-border/50 rounded-2xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            דיוק תחזית — תקופות שעברו
          </h2>
          {avgAccuracy !== null && (
            <div className={`text-sm font-bold px-3 py-1 rounded-full ${avgAccuracy >= 80 ? "bg-green-500/20 text-green-400" : avgAccuracy >= 60 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
              דיוק ממוצע: {avgAccuracy.toFixed(1)}%
            </div>
          )}
        </div>
        {(data.forecastAccuracy || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>אין נתוני השוואה עדיין — הנתונים מציגים תחזית מול פועל לתקופות שעברו</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs border-b border-border/30">
                  <th className="text-right py-2 px-3 font-medium">תקופה</th>
                  <th className="text-right py-2 px-3 font-medium">תחזית משוקללת</th>
                  <th className="text-right py-2 px-3 font-medium">פועל (נסגר)</th>
                  <th className="text-right py-2 px-3 font-medium">עסקאות פתוחות</th>
                  <th className="text-center py-2 px-3 font-medium">דיוק</th>
                </tr>
              </thead>
              <tbody>
                {(data.forecastAccuracy || []).map((row: any, i: number) => {
                  const acc = row.accuracy_pct !== null ? Number(row.accuracy_pct) : null;
                  return (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="py-2 px-3 text-muted-foreground">{formatPeriod(row.forecast_period, period)}</td>
                      <td className="py-2 px-3 text-blue-400">{fmtC(row.forecasted_weighted)}</td>
                      <td className="py-2 px-3 text-green-400 font-medium">{fmtC(row.actual_won)}</td>
                      <td className="py-2 px-3 text-muted-foreground">{fmt(row.total_count - row.won_count)}</td>
                      <td className="py-2 px-3 text-center">
                        {acc !== null ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${acc >= 80 ? "bg-green-500/20 text-green-400" : acc >= 60 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                            {acc.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">* דיוק = ערך פועל שנסגר / תחזית משוקללת × 100. מחושב לתאריכי סגירה שעברו כבר.</p>
      </div>
    </div>
  );
}
