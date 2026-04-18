import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import {
  BarChart3, TrendingUp, Award, Target, Users, DollarSign,
  RefreshCw, AlertTriangle, Zap, ArrowUpDown
} from "lucide-react";

const API = "/api";
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtPct = (n: any) => `${Number(n || 0).toFixed(1)}%`;
const fmtDays = (n: any) => `${Number(n || 0).toFixed(1)} ימים`;

const STAGE_LABELS: Record<string, string> = {
  lead: "ליד", qualified: "מוסמך", proposal: "הצעה", negotiation: "מו\"מ", won: "נסגר", lost: "אבוד"
};
const STAGE_COLORS: Record<string, string> = {
  lead: "bg-gray-500/60", qualified: "bg-blue-500/60", proposal: "bg-purple-500/60",
  negotiation: "bg-amber-500/60", won: "bg-green-500/60", lost: "bg-red-500/60"
};
const STAGE_TEXT: Record<string, string> = {
  lead: "text-gray-400", qualified: "text-blue-400", proposal: "text-purple-400",
  negotiation: "text-amber-400", won: "text-green-400", lost: "text-red-400"
};

type Tab = "funnel" | "velocity" | "trends" | "leaderboard" | "winloss";

export default function SalesAnalytics() {
  const [activeTab, setActiveTab] = useState<Tab>("funnel");
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = () => {
    setLoading(true);
    authFetch(`${API}/sales/analytics`)
      .then(r => r.json())
      .then(d => setData(d || {}))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const funnel = data.funnel || [];
  const velocity = data.velocity || {};
  const dealSizes = data.dealSizes || [];
  const repPerformance = data.repPerformance || [];
  const winLossData = data.winLoss || [];
  const winLossReasons = data.winLossReasons || [];

  const totalDeals = funnel.reduce((s: number, r: any) => s + Number(r.count || 0), 0);
  const wonDeals = funnel.find((r: any) => r.stage === "won");
  const lostDeals = funnel.find((r: any) => r.stage === "lost");
  const activeDeals = funnel.filter((r: any) => !["won", "lost"].includes(r.stage)).reduce((s: number, r: any) => s + Number(r.count || 0), 0);

  const winRate = (velocity.won_count + velocity.lost_count) > 0
    ? Math.round(Number(velocity.won_count) / (Number(velocity.won_count) + Number(velocity.lost_count)) * 100)
    : 0;

  const maxFunnelCount = Math.max(...funnel.filter((r: any) => !["won","lost"].includes(r.stage)).map((r: any) => Number(r.count || 0)), 1);
  const maxDealSize = Math.max(...dealSizes.map((r: any) => Number(r.avg_deal_size || 0)), 1);
  const maxRepValue = Math.max(...repPerformance.map((r: any) => Number(r.won_value || 0)), 1);

  const sortedReps = useMemo(() => [...repPerformance].sort((a, b) => {
    const va = Number(a.won_value || 0); const vb = Number(b.won_value || 0);
    return sortDir === "desc" ? vb - va : va - vb;
  }), [repPerformance, sortDir]);

  const winLossBySource = useMemo(() => {
    const map: Record<string, { won: number; lost: number; won_value: number; lost_value: number }> = {};
    winLossData.forEach((r: any) => {
      const key = r.source || "ישיר";
      if (!map[key]) map[key] = { won: 0, lost: 0, won_value: 0, lost_value: 0 };
      if (r.stage === "won") { map[key].won += Number(r.won || 0); map[key].won_value += Number(r.won_value || 0); }
      if (r.stage === "lost") { map[key].lost += Number(r.lost || 0); map[key].lost_value += Number(r.lost_value || 0); }
    });
    return Object.entries(map).map(([source, v]) => ({ source, ...v, total: v.won + v.lost, win_rate: v.won + v.lost > 0 ? Math.round(v.won / (v.won + v.lost) * 100) : 0 }));
  }, [winLossData]);

  const kpis = [
    { label: "שיעור זכייה", value: `${winRate}%`, icon: Award, color: "text-green-400" },
    { label: "עסקאות פעילות", value: fmt(activeDeals), icon: Target, color: "text-blue-400" },
    { label: "זמן סגירה ממוצע", value: fmtDays(velocity.avg_days_to_close), icon: Zap, color: "text-amber-400" },
    { label: "ערך ממוצע לעסקה", value: fmtC(repPerformance.reduce((s: number, r: any) => s + Number(r.avg_deal_size || 0), 0) / Math.max(repPerformance.length, 1)), icon: DollarSign, color: "text-cyan-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-400" />
            אנליטיקת מכירות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח משפך, מהירות מכירה, השוואת נציגים ו-Win/Loss</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 bg-card border border-border px-3 py-2.5 rounded-xl text-sm hover:bg-muted">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> רענן
        </button>
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

      <div className="flex border-b border-border/50 gap-1 overflow-x-auto">
        {([
          ["funnel", "משפך המרה"],
          ["velocity", "מהירות מכירה"],
          ["trends", "מגמות ערך"],
          ["leaderboard", "לוח מצטיינים"],
          ["winloss", "ניצחון/הפסד"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-2xl p-5 animate-pulse h-48" />
          ))}
        </div>
      ) : activeTab === "funnel" ? (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="font-semibold mb-6">משפך המרה לפי שלב</h2>
          <div className="space-y-3">
            {funnel.filter((r: any) => !["won","lost"].includes(r.stage)).map((row: any, i: number) => {
              const pct = maxFunnelCount > 0 ? (Number(row.count || 0) / maxFunnelCount) * 100 : 0;
              return (
                <div key={i} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-2 text-sm font-medium">{STAGE_LABELS[row.stage] || row.stage}</div>
                  <div className="col-span-6">
                    <div className="bg-muted/20 h-8 rounded-lg overflow-hidden flex items-center">
                      <div className={`h-full ${STAGE_COLORS[row.stage] || "bg-blue-500/60"} rounded-lg transition-all duration-500 flex items-center px-3`} style={{ width: `${pct}%` }}>
                        <span className="text-xs text-foreground font-medium">{row.count} עסקאות</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 text-right font-bold text-foreground">{fmtC(row.total_value)}</div>
                  <div className="col-span-2 text-right text-muted-foreground text-xs">{fmtC(row.weighted_value)} משוקלל</div>
                </div>
              );
            })}
            <div className="border-t border-border/30 pt-3 flex justify-between items-center">
              <div className="flex gap-6">
                {wonDeals && <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full" /><span className="text-sm text-green-400 font-medium">{wonDeals.count} נסגרו — {fmtC(wonDeals.total_value)}</span></div>}
                {lostDeals && <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full" /><span className="text-sm text-red-400 font-medium">{lostDeals.count} אבודות</span></div>}
              </div>
              <span className="text-sm text-muted-foreground">שיעור זכייה: <strong className={winRate >= 50 ? "text-green-400" : "text-amber-400"}>{winRate}%</strong></span>
            </div>
          </div>
        </div>
      ) : activeTab === "velocity" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-400" /> מהירות מכירה</h2>
            <div className="space-y-4">
              {[
                { label: "זמן ממוצע לסגירת עסקה", value: fmtDays(velocity.avg_days_to_close), color: "text-green-400" },
                { label: "זמן ממוצע עד הפסד", value: fmtDays(velocity.avg_days_lost), color: "text-red-400" },
                { label: "עסקאות שנסגרו", value: fmt(velocity.won_count), color: "text-green-400" },
                { label: "עסקאות שאבדו", value: fmt(velocity.lost_count), color: "text-red-400" },
                { label: "עסקאות פעילות", value: fmt(velocity.active_count), color: "text-blue-400" },
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center border-b border-border/20 pb-3">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className={`font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h2 className="font-semibold mb-4">יחס זכייה/הפסד</h2>
            {(() => {
              const won = Number(velocity.won_count || 0);
              const lost = Number(velocity.lost_count || 0);
              const total = won + lost;
              const wonPct = total > 0 ? Math.round(won / total * 100) : 0;
              const lostPct = 100 - wonPct;
              return (
                <div className="space-y-4">
                  <div className="flex h-8 rounded-xl overflow-hidden gap-0.5">
                    <div className="bg-green-500/60 flex items-center justify-center text-xs text-foreground font-medium" style={{ width: `${wonPct}%` }}>{wonPct > 10 ? `${wonPct}% נסגרו` : ""}</div>
                    <div className="bg-red-500/60 flex-1 flex items-center justify-center text-xs text-foreground font-medium">{lostPct > 10 ? `${lostPct}% אבדו` : ""}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-500/10 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">{won}</div>
                      <div className="text-xs text-muted-foreground">עסקאות שנסגרו</div>
                    </div>
                    <div className="bg-red-500/10 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-red-400">{lost}</div>
                      <div className="text-xs text-muted-foreground">עסקאות שאבדו</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : activeTab === "trends" ? (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-400" /> מגמת גודל עסקה ממוצע (12 חודשים)</h2>
          {dealSizes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">אין נתוני מגמה עדיין</div>
          ) : (
            <div className="space-y-3">
              {dealSizes.map((row: any, i: number) => {
                const pct = maxDealSize > 0 ? (Number(row.avg_deal_size || 0) / maxDealSize) * 100 : 0;
                return (
                  <div key={i} className="grid grid-cols-12 gap-3 items-center text-sm">
                    <div className="col-span-2 text-muted-foreground text-xs">{row.month || "—"}</div>
                    <div className="col-span-7">
                      <div className="bg-muted/20 h-6 rounded-lg overflow-hidden">
                        <div className="h-full bg-blue-500/60 rounded-lg transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="col-span-2 text-right font-bold">{fmtC(row.avg_deal_size)}</div>
                    <div className="col-span-1 text-xs text-muted-foreground text-right">{row.deal_count} עסקאות</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === "leaderboard" ? (
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <div className="p-5 flex justify-between items-center border-b border-border/50">
            <h2 className="font-semibold flex items-center gap-2"><Award className="w-5 h-5 text-amber-400" /> לוח מצטיינים — נציגי מכירות</h2>
            <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowUpDown className="w-3.5 h-3.5" /> מיון
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30"><tr>
                {["#", "נציג", "ערך שנסגר", "עסקאות שנסגרו", "שיעור זכייה", "עסקה ממוצעת", "צנרת פעילה"].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sortedReps.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">אין נתוני ביצועים — הוסף הזדמנויות עם נציגים מוקצים</td></tr>
                ) : sortedReps.map((rep, i) => {
                  const pct = maxRepValue > 0 ? (Number(rep.won_value || 0) / maxRepValue) * 100 : 0;
                  return (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-4 py-3 font-bold text-muted-foreground">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{rep.rep_name}</div>
                        <div className="w-24 bg-muted/20 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-green-400">{fmtC(rep.won_value)}</td>
                      <td className="px-4 py-3 text-center">{rep.won_deals}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${Number(rep.win_rate) >= 50 ? "text-green-400" : "text-amber-400"}`}>{fmtPct(rep.win_rate)}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtC(rep.avg_deal_size)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtC(Number(rep.pipeline_value || 0) - Number(rep.won_value || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "winloss" ? (
        <div className="space-y-4">
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" /> ניתוח Win/Loss לפי מקור</h2>
            {winLossBySource.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">אין נתונים — הוסף הזדמנויות עם מקור ותוצאה</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30"><tr>
                    {["מקור", "נסגרו", "אבדו", "שיעור זכייה", "ערך שנסגר", "ערך שאבד"].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {winLossBySource.map((row, i) => (
                      <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{row.source}</td>
                        <td className="px-4 py-3 text-green-400 font-bold">{row.won}</td>
                        <td className="px-4 py-3 text-red-400 font-bold">{row.lost}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-muted/20 h-2 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500/60 rounded-full" style={{ width: `${row.win_rate}%` }} />
                            </div>
                            <span className={row.win_rate >= 50 ? "text-green-400" : "text-amber-400"}>{row.win_rate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-green-400">{fmtC(row.won_value)}</td>
                        <td className="px-4 py-3 text-red-400">{fmtC(row.lost_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h2 className="font-semibold mb-4">ניתוח לפי שלב</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {funnel.map((row: any, i: number) => (
                <div key={i} className={`rounded-xl p-3 text-center border ${STAGE_COLORS[row.stage]?.replace("/60", "/10") || "bg-muted/10"} border-border/20`}>
                  <div className={`text-2xl font-bold ${STAGE_TEXT[row.stage] || "text-foreground"}`}>{row.count}</div>
                  <div className="text-xs text-muted-foreground mt-1">{STAGE_LABELS[row.stage] || row.stage}</div>
                  <div className="text-xs text-muted-foreground">{fmtC(row.total_value)}</div>
                </div>
              ))}
            </div>
          </div>

          {winLossReasons.length > 0 && (
            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" /> סיבות ניצחון/הפסד לפי קטגוריה
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30"><tr>
                    {["תוצאה", "קטגוריה", "מספר מקרים", "ממוצע עסקה", "סה\"כ"].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {winLossReasons.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${row.outcome === "won" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                            {row.outcome === "won" ? "זכייה" : "הפסד"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">{row.reason_category || "כללי"}</td>
                        <td className="px-4 py-3 text-center font-bold">{row.count}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtC(row.avg_deal_value)}</td>
                        <td className="px-4 py-3 font-bold">{fmtC(row.total_deal_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
