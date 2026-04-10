/**
 * Data Quality Dashboard — quality rule results, scores, and trends.
 */

import { useQualityResults, useFreshness } from "@/hooks/useDataFabric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, Clock, Activity, Zap
} from "lucide-react";

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; icon: any }> = {
  pass: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-300", icon: CheckCircle2 },
  warn: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-300", icon: AlertTriangle },
  fail: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-300", icon: XCircle },
  error: { bg: "bg-red-600/15", border: "border-red-600/40", text: "text-red-200", icon: XCircle },
};

export default function DataQualityDashboard() {
  const { data: qualityData } = useQualityResults(200);
  const { data: freshnessData } = useFreshness();

  const results = qualityData?.results ?? [];
  const summary = qualityData?.summary ?? { totalChecks: 0, pass: 0, warn: 0, fail: 0, error: 0, passRate: 0, activeRules: 0 };
  const freshness = freshnessData?.summary ?? { total: 0, fresh: 0, warning: 0, stale: 0, missing: 0 };
  const measurements = freshnessData?.measurements ?? [];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Shield className="w-7 h-7 text-green-400" />
          Data Quality + Freshness
        </h1>
        <p className="text-white/60 text-sm mt-1">
          מרכז בקרת איכות ורעננות — תוצאות כללים, ציונים, ו-SLA per dataset.
        </p>
      </div>

      {/* Quality Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20">
          <CardContent className="p-5">
            <Shield className="w-5 h-5 text-green-400 mb-2" />
            <div className="text-3xl font-bold text-green-400">{summary.passRate.toFixed(0)}%</div>
            <div className="text-xs text-white/60 mt-1">שיעור מעבר</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1420] border-white/10">
          <CardContent className="p-5">
            <CheckCircle2 className="w-5 h-5 text-green-400 mb-2" />
            <div className="text-3xl font-bold text-green-400">{summary.pass}</div>
            <div className="text-xs text-white/60 mt-1">עברו</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1420] border-white/10">
          <CardContent className="p-5">
            <AlertTriangle className="w-5 h-5 text-yellow-400 mb-2" />
            <div className="text-3xl font-bold text-yellow-400">{summary.warn}</div>
            <div className="text-xs text-white/60 mt-1">אזהרות</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1420] border-white/10">
          <CardContent className="p-5">
            <XCircle className="w-5 h-5 text-red-400 mb-2" />
            <div className="text-3xl font-bold text-red-400">{summary.fail + summary.error}</div>
            <div className="text-xs text-white/60 mt-1">כשלים</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Quality Results */}
        <Card className="bg-[#0f1420] border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              תוצאות בדיקה אחרונות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-2">
              {results.length === 0 ? (
                <div className="text-center py-16 text-white/40">
                  <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>אין תוצאות בדיקה</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map((r) => {
                    const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pass!;
                    const Icon = cfg.icon;
                    return (
                      <div key={r.id} className={`flex items-start gap-3 p-3 rounded border ${cfg.bg} ${cfg.border}`}>
                        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.text}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-mono text-xs truncate">{r.datasetKey}</div>
                            <Badge variant="outline" className={`${cfg.text} border-current text-[10px] shrink-0`}>
                              {r.status.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-white/60">
                            <span>{r.rowsChecked ?? 0} נבדקו</span>
                            {r.rowsFailed != null && r.rowsFailed > 0 && (
                              <span className="text-red-400">{r.rowsFailed} נכשלו</span>
                            )}
                            <span className="mr-auto">{new Date(r.executedAt).toLocaleTimeString("he-IL")}</span>
                          </div>
                          {r.message && (
                            <div className="text-[10px] text-white/50 mt-1 truncate">{r.message}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Freshness */}
        <Card className="bg-[#0f1420] border-cyan-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-300">
              <Clock className="w-5 h-5" />
              רעננות Datasets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Freshness Summary */}
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2 rounded bg-green-500/10 border border-green-500/30 text-center">
                <div className="text-xl font-bold text-green-400">{freshness.fresh}</div>
                <div className="text-[10px] text-white/60">טרי</div>
              </div>
              <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/30 text-center">
                <div className="text-xl font-bold text-yellow-400">{freshness.warning}</div>
                <div className="text-[10px] text-white/60">אזהרה</div>
              </div>
              <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-center">
                <div className="text-xl font-bold text-red-400">{freshness.stale}</div>
                <div className="text-[10px] text-white/60">מיושן</div>
              </div>
              <div className="p-2 rounded bg-gray-500/10 border border-gray-500/30 text-center">
                <div className="text-xl font-bold text-gray-400">{freshness.missing}</div>
                <div className="text-[10px] text-white/60">חסר</div>
              </div>
            </div>

            {/* Per-dataset measurements */}
            <ScrollArea className="h-[370px] pr-2">
              <div className="space-y-1.5">
                {measurements.slice(0, 60).map((m) => {
                  const cfg = m.status === "fresh" ? { color: "text-green-400", bg: "bg-green-500/5" }
                    : m.status === "warning" ? { color: "text-yellow-400", bg: "bg-yellow-500/5" }
                    : m.status === "stale" ? { color: "text-red-400", bg: "bg-red-500/5" }
                    : { color: "text-gray-400", bg: "bg-gray-500/5" };
                  return (
                    <div key={m.datasetKey} className={`flex items-center gap-2 p-2 rounded ${cfg.bg} border border-white/5`}>
                      <Clock className={`w-3 h-3 shrink-0 ${cfg.color}`} />
                      <div className="flex-1 font-mono text-[10px] truncate">{m.datasetKey}</div>
                      <div className={`text-[10px] ${cfg.color} shrink-0`}>
                        {m.actualLagSeconds != null
                          ? m.actualLagSeconds < 60 ? `${m.actualLagSeconds}s`
                          : m.actualLagSeconds < 3600 ? `${Math.round(m.actualLagSeconds / 60)}m`
                          : `${Math.round(m.actualLagSeconds / 3600)}h`
                          : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
