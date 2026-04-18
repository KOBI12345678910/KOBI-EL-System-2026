/**
 * Platform Observatory — DataOps visibility for the entire platform.
 *
 * Shows pipeline health, raw ingestion throughput, quarantine rate,
 * canonical entities created, events emitted, state coverage.
 */

import { usePlatformSnapshot, usePipelineMetrics } from "@/hooks/useDataPlatform";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, Database, Zap, AlertTriangle, CheckCircle2, XCircle,
  Clock, TrendingUp, Layers, GitBranch, Workflow
} from "lucide-react";

export default function PlatformObservatory() {
  const { data: snapshot } = usePlatformSnapshot();
  const { data: metrics = [] } = usePipelineMetrics();

  const totalAccepted = metrics.reduce((sum, m) => sum + m.acceptedRecords, 0);
  const totalQuarantined = metrics.reduce((sum, m) => sum + m.quarantinedRecords, 0);
  const totalEvents = metrics.reduce((sum, m) => sum + m.emittedEvents, 0);
  const avgHealth = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.healthScore, 0) / metrics.length
    : 100;

  const s = snapshot ?? {
    totalCanonical: 0, totalObjects: 0, totalLiveStates: 0,
    atRiskEntities: 0, blockedEntities: 0, freshEntities: 0,
    stateBreakdown: {}, eventsTotal: 0, pipelineHealth: {}, generatedAt: "",
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Workflow className="w-7 h-7 text-cyan-400" />
          Platform Observatory
        </h1>
        <p className="text-white/60 text-sm mt-1">
          מעקב מלא אחרי שכבת הנתונים — pipelines, raw → curated, canonical, events, state
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatTile icon={Database} label="ישויות קנוניות" value={s.totalCanonical} color="text-blue-400" />
        <StatTile icon={Layers} label="אובייקטי אונטולוגיה" value={s.totalObjects} color="text-purple-400" />
        <StatTile icon={Activity} label="state חי" value={s.totalLiveStates} color="text-cyan-400" />
        <StatTile icon={AlertTriangle} label="בסיכון" value={s.atRiskEntities} color="text-orange-400" />
        <StatTile icon={XCircle} label="חסומות" value={s.blockedEntities} color="text-red-400" />
        <StatTile icon={Zap} label="events" value={s.eventsTotal} color="text-yellow-400" />
      </div>

      {/* Pipeline Metrics */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5 text-cyan-400" />
            Pipeline Metrics
            <Badge variant="outline" className="ml-auto">{metrics.length} pipelines</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 pb-4 border-b border-white/10">
            <div>
              <div className="text-xs text-white/50">סה״כ accepted</div>
              <div className="text-2xl font-bold text-green-400">{totalAccepted.toLocaleString("he-IL")}</div>
            </div>
            <div>
              <div className="text-xs text-white/50">sh״k quarantined</div>
              <div className="text-2xl font-bold text-yellow-400">{totalQuarantined.toLocaleString("he-IL")}</div>
            </div>
            <div>
              <div className="text-xs text-white/50">סה״כ events</div>
              <div className="text-2xl font-bold text-cyan-400">{totalEvents.toLocaleString("he-IL")}</div>
            </div>
            <div>
              <div className="text-xs text-white/50">בריאות ממוצעת</div>
              <div className={`text-2xl font-bold ${avgHealth >= 90 ? "text-green-400" : avgHealth >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                {avgHealth.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Per-pipeline rows */}
          <ScrollArea className="h-[320px] pr-2">
            {metrics.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <Workflow className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>אין pipelines להצגה</p>
              </div>
            ) : (
              <div className="space-y-2">
                {metrics.map((m) => {
                  const successRate = m.totalRuns > 0 ? (m.successfulRuns / m.totalRuns) * 100 : 100;
                  return (
                    <div key={m.pipelineName} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-cyan-400" />
                          <div className="font-semibold font-mono text-sm">{m.pipelineName}</div>
                        </div>
                        <Badge variant="outline" className={`${
                          m.healthScore >= 90 ? "border-green-500/40 text-green-300" :
                          m.healthScore >= 70 ? "border-yellow-500/40 text-yellow-300" :
                          "border-red-500/40 text-red-300"
                        }`}>
                          {m.healthScore}% health
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                        <div>
                          <div className="text-white/50 text-[10px]">runs</div>
                          <div className="font-semibold">{m.totalRuns}</div>
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px]">accepted</div>
                          <div className="font-semibold text-green-400">{m.acceptedRecords}</div>
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px]">quarantined</div>
                          <div className="font-semibold text-yellow-400">{m.quarantinedRecords}</div>
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px]">rejected</div>
                          <div className="font-semibold text-red-400">{m.rejectedRecords}</div>
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px]">events</div>
                          <div className="font-semibold text-cyan-400">{m.emittedEvents}</div>
                        </div>
                        <div>
                          <div className="text-white/50 text-[10px]">avg ms</div>
                          <div className="font-semibold">{m.avgDurationMs ?? "—"}</div>
                        </div>
                      </div>
                      <Progress value={successRate} className="h-1 mt-2" />
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* State Breakdown */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            State breakdown by type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(s.stateBreakdown).map(([type, count]) => (
              <div key={type} className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-xs text-white/60 truncate">{type}</div>
                <div className="text-2xl font-bold text-purple-400">{count}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-[#0f1420] border border-white/10 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-white/60">
        <Icon className={`w-3 h-3 ${color}`} />
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
