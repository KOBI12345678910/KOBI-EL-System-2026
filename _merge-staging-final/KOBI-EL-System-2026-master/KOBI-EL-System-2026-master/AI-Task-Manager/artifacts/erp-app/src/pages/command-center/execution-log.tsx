/**
 * Execution Log — audit trail of every autonomous action the system has taken.
 *
 * Complete provenance: which decision, which rule, what params, result, duration.
 */

import { useExecutions } from "@/hooks/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Play, CheckCircle2, XCircle, Clock, Zap, Activity,
  ArrowRight, Shield, TrendingUp, AlertTriangle
} from "lucide-react";

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; icon: any }> = {
  queued: { bg: "bg-gray-500/10", border: "border-gray-500/30", text: "text-gray-300", icon: Clock },
  running: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300", icon: Play },
  success: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-300", icon: CheckCircle2 },
  failed: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-300", icon: XCircle },
  rolled_back: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-300", icon: Activity },
};

export default function ExecutionLog() {
  const { data } = useExecutions(200);
  const executions = data?.executions ?? [];
  const stats = data?.stats ?? { total: 0, successful: 0, failed: 0, avgDurationMs: 0, successRate: 0 };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Zap className="w-7 h-7 text-cyan-400" />
          יומן ביצוע אוטונומי
        </h1>
        <p className="text-white/60 text-sm mt-1">
          כל פעולה שהמערכת ביצעה אוטונומית — עם פרובננס מלא, משך, ותוצאה
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={Zap} label="סה״כ ביצועים" value={stats.total} color="text-cyan-400" />
        <StatCard icon={CheckCircle2} label="הצליחו" value={stats.successful} color="text-green-400" />
        <StatCard icon={XCircle} label="נכשלו" value={stats.failed} color="text-red-400" />
        <StatCard
          icon={TrendingUp}
          label="שיעור הצלחה"
          value={`${stats.successRate.toFixed(0)}%`}
          color={stats.successRate >= 80 ? "text-green-400" : stats.successRate >= 60 ? "text-yellow-400" : "text-red-400"}
        />
        <StatCard
          icon={Clock}
          label="משך ממוצע"
          value={`${Math.round(stats.avgDurationMs)}ms`}
          color="text-blue-400"
        />
      </div>

      {/* Success Rate Bar */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              <span className="text-sm font-semibold">שיעור הצלחה כולל</span>
            </div>
            <span className="text-2xl font-bold text-green-400">{stats.successRate.toFixed(1)}%</span>
          </div>
          <Progress value={stats.successRate} className="h-3" />
        </CardContent>
      </Card>

      {/* Executions */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            פעולות אחרונות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-480px)] pr-2">
            {executions.length === 0 ? (
              <div className="text-center py-16 text-white/40">
                <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>אין פעולות ביצוע להצגה</p>
                <p className="text-xs mt-1">פעולות אוטונומיות יופיעו כאן כשירוצו</p>
              </div>
            ) : (
              <div className="space-y-2">
                {executions.map((exec) => {
                  const cfg = STATUS_CONFIG[exec.status] ?? STATUS_CONFIG.queued!;
                  const Icon = cfg.icon;
                  return (
                    <div key={exec.id} className={`p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <Icon className={`w-5 h-5 ${cfg.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="font-semibold text-sm">
                              {exec.actionType}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`${cfg.text} border-current text-[10px]`}>
                                {exec.status}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                #{exec.id}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-white/60 mt-1">
                            <span>{exec.targetModule}</span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="truncate">{exec.targetEntityType}:{exec.targetEntityId}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-white/50">
                            {exec.startedAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(exec.startedAt).toLocaleTimeString("he-IL")}
                              </span>
                            )}
                            {exec.durationMs != null && (
                              <span>⏱ {exec.durationMs}ms</span>
                            )}
                            <span>החלטה #{exec.decisionId}</span>
                          </div>
                          {exec.errorMessage && (
                            <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-[10px] text-red-300">
                              <AlertTriangle className="w-3 h-3 inline ml-1" />
                              {exec.errorMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card className="bg-[#0f1420] border-white/10">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
          <Icon className={`w-4 h-4 ${color}`} />
          {label}
        </div>
        <div className={`text-3xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
