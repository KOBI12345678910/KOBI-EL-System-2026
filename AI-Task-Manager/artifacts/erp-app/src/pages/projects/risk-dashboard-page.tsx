import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, AlertTriangle, CheckCircle2, Shield, BarChart3, TrendingUp, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

const RISK_COLORS: Record<number, string> = {
  1: "bg-green-500/80",
  2: "bg-green-400/80",
  3: "bg-yellow-400/80",
  4: "bg-orange-400/80",
  5: "bg-orange-500/80",
  6: "bg-orange-400/80",
  8: "bg-orange-500/80",
  9: "bg-red-400/80",
  10: "bg-red-500/80",
  12: "bg-red-600/80",
  15: "bg-red-700/80",
  16: "bg-red-700/80",
  20: "bg-red-800/80",
  25: "bg-red-900/80",
};

function getCellColor(p: number, i: number): string {
  const score = p * i;
  if (score >= 20) return "bg-red-900/80 text-foreground";
  if (score >= 15) return "bg-red-700/80 text-foreground";
  if (score >= 12) return "bg-red-600/80 text-foreground";
  if (score >= 9) return "bg-red-400/80 text-foreground";
  if (score >= 6) return "bg-orange-400/80 text-foreground";
  if (score >= 4) return "bg-yellow-400/80 text-gray-900";
  if (score >= 3) return "bg-yellow-300/80 text-gray-900";
  return "bg-green-400/80 text-gray-900";
}

const levels = ["נמוך מאוד", "נמוך", "בינוני", "גבוה", "גבוה מאוד"];

export default function RiskDashboardPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [allRisks, setAllRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [matrixRisks, setMatrixRisks] = useState<Record<string, any[]>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, rRes] = await Promise.all([
        authFetch(`${API}/project-risks-dashboard`),
        authFetch(`${API}/project-risks`),
      ]);
      const d = dRes.ok ? await dRes.json() : null;
      const r = rRes.ok ? await rRes.json() : [];
      setDashboard(d);
      const risks = Array.isArray(r) ? r : [];
      setAllRisks(risks);
      const matrix: Record<string, any[]> = {};
      risks.forEach((risk: any) => {
        const pMap: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
        const iMap: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
        const legacyP: Record<string, number> = { low: 2, medium: 3, high: 4 };
        const legacyI: Record<string, number> = { low: 2, medium: 3, high: 4 };
        const p = pMap[risk.probability] ?? legacyP[risk.probability] ?? 3;
        const i = iMap[risk.impact] ?? legacyI[risk.impact] ?? 3;
        const key = `${p}-${i}`;
        if (!matrix[key]) matrix[key] = [];
        matrix[key].push(risk);
      });
      setMatrixRisks(matrix);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const summary = dashboard?.summary || {};
  const byCategory = dashboard?.byCategory || [];
  const topRisks = dashboard?.topRisks || [];

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="text-blue-400 w-6 h-6" />
            דשבורד סיכונים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח ומעקב סיכוני פרויקטים</p>
        </div>
        <button onClick={load} className="p-2 hover:bg-muted rounded-xl text-muted-foreground">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "סה\"כ סיכונים", value: summary.totalRisks || 0, icon: ShieldAlert, color: "text-blue-400" },
              { label: "סיכונים פתוחים", value: summary.openRisks || 0, icon: AlertTriangle, color: "text-red-400" },
              { label: "סיכונים קריטיים", value: summary.highRisks || 0, icon: Shield, color: "text-orange-400" },
              { label: "ציון סיכון ממוצע", value: summary.avgScore || "0", icon: TrendingUp, color: "text-purple-400" },
            ].map((kpi, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card border border-border/50 rounded-2xl p-4">
                <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
                <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h2 className="text-foreground font-bold mb-4">מטריצת הסתברות/השפעה (5x5)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="p-1 text-muted-foreground text-right">הסתב' \ השפעה</th>
                      {levels.map((l, i) => (
                        <th key={i} className="p-1 text-center text-muted-foreground w-14">{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[5, 4, 3, 2, 1].map(p => (
                      <tr key={p}>
                        <td className="p-1 text-muted-foreground text-right">{levels[p - 1]}</td>
                        {[1, 2, 3, 4, 5].map(i => {
                          const key = `${p}-${i}`;
                          const cellRisks = matrixRisks[key] || [];
                          const score = p * i;
                          return (
                            <td key={i} className={`p-1 w-14 h-10 text-center rounded-sm ${getCellColor(p, i)} cursor-pointer relative group`}
                              title={cellRisks.map((r: any) => r.title).join(", ") || ""}>
                              <div className="font-bold">{score}</div>
                              {cellRisks.length > 0 && (
                                <div className="absolute -top-1 -right-1 bg-white text-gray-900 rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                                  {cellRisks.length}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3 mt-3 flex-wrap">
                <div className="flex items-center gap-1 text-xs"><div className="w-3 h-3 rounded bg-green-400/80" /><span className="text-muted-foreground">נמוך</span></div>
                <div className="flex items-center gap-1 text-xs"><div className="w-3 h-3 rounded bg-yellow-400/80" /><span className="text-muted-foreground">בינוני</span></div>
                <div className="flex items-center gap-1 text-xs"><div className="w-3 h-3 rounded bg-orange-400/80" /><span className="text-muted-foreground">גבוה</span></div>
                <div className="flex items-center gap-1 text-xs"><div className="w-3 h-3 rounded bg-red-700/80" /><span className="text-muted-foreground">קריטי</span></div>
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h2 className="text-foreground font-bold mb-4">5 הסיכונים המובילים</h2>
              <div className="space-y-3">
                {topRisks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">אין סיכונים להצגה</p>
                ) : topRisks.map((r: any, i: number) => (
                  <div key={r.id} className="flex items-center gap-3 p-2 bg-muted/20 rounded-xl">
                    <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.category || "—"}</div>
                    </div>
                    <div className="text-sm font-mono font-bold text-orange-400">{r.risk_score || r.riskScore}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h2 className="text-foreground font-bold mb-4">התפלגות לפי קטגוריה</h2>
            {byCategory.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין נתונים</p>
            ) : (
              <div className="space-y-2">
                {byCategory.map((c: any, i: number) => {
                  const max = Math.max(...byCategory.map((x: any) => x.count));
                  const pct = max > 0 ? (c.count / max) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-24 text-xs text-muted-foreground truncate">{c.name}</div>
                      <div className="flex-1 bg-muted/20 rounded-full h-4 overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.05 }}
                          className="h-full bg-blue-500/60 rounded-full" />
                      </div>
                      <div className="w-6 text-xs text-foreground font-bold">{c.count}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
