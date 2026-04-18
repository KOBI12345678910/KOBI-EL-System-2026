/**
 * Decision Queue — the cockpit for autonomous decisions.
 *
 * Every event flows through the Decision Engine. Matching rules produce
 * decisions. Some are auto-executed; others wait for human approval here.
 */

import { useState } from "react";
import { useDecisions, useDecisionActions } from "@/hooks/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Target, CheckCheck, X, Zap, Clock, TrendingUp, TrendingDown,
  Brain, AlertTriangle, DollarSign, ArrowRight, Shield, Filter,
  CheckCircle2, XCircle, Clock3
} from "lucide-react";

const PRIORITY_CONFIG: Record<string, { bg: string; border: string; text: string; rank: number }> = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-300", rank: 4 },
  high: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-300", rank: 3 },
  medium: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-300", rank: 2 },
  low: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300", rank: 1 },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending_eval: { label: "ממתין להערכה", color: "text-gray-400", icon: Clock3 },
  recommended: { label: "מומלץ", color: "text-blue-400", icon: Brain },
  queued: { label: "בתור", color: "text-yellow-400", icon: Clock },
  auto_approved: { label: "אושר אוטו׳", color: "text-cyan-400", icon: Zap },
  awaiting_approval: { label: "ממתין לאישור", color: "text-yellow-300", icon: Clock },
  approved: { label: "אושר", color: "text-green-400", icon: CheckCheck },
  executing: { label: "מתבצע", color: "text-blue-400", icon: Clock },
  executed: { label: "בוצע", color: "text-green-500", icon: CheckCircle2 },
  failed: { label: "נכשל", color: "text-red-400", icon: XCircle },
  rejected: { label: "נדחה", color: "text-red-400", icon: X },
  expired: { label: "פג תוקף", color: "text-gray-400", icon: Clock3 },
};

export default function DecisionQueue() {
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const { data: allDecisions = [] } = useDecisions({});
  const { approve, reject } = useDecisionActions();

  const filtered = allDecisions
    .filter(d => !priorityFilter || d.priority === priorityFilter)
    .sort((a, b) => {
      const ra = PRIORITY_CONFIG[a.priority]?.rank ?? 0;
      const rb = PRIORITY_CONFIG[b.priority]?.rank ?? 0;
      if (rb !== ra) return rb - ra;
      return b.score - a.score;
    });

  const pending = filtered.filter(d => d.status === "awaiting_approval" || d.status === "approved");
  const autoExecuted = filtered.filter(d => d.status === "auto_approved" || d.status === "executed");
  const totalProfitImpact = filtered.reduce((sum, d) => sum + (d.estimatedProfitImpact ?? 0), 0);
  const critical = filtered.filter(d => d.priority === "critical").length;

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Target className="w-7 h-7 text-yellow-400" />
          תור החלטות
        </h1>
        <p className="text-white/60 text-sm mt-1">
          החלטות שהמערכת יצרה בתגובה לאירועים — אישור, דחייה, או צפייה בהחלטות אוטונומיות
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Target} label="החלטות פעילות" value={filtered.length} color="text-yellow-400" />
        <StatCard icon={AlertTriangle} label="קריטיות" value={critical} color="text-red-400" />
        <StatCard icon={Zap} label="אושרו אוטומטית" value={autoExecuted.length} color="text-cyan-400" />
        <StatCard
          icon={DollarSign}
          label="השפעת רווח צפויה"
          value={`₪${(totalProfitImpact / 1000).toFixed(0)}K`}
          color={totalProfitImpact >= 0 ? "text-green-400" : "text-red-400"}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-white/40" />
        <Button
          variant={priorityFilter === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setPriorityFilter("")}
          className="h-7 text-xs"
        >
          הכל
        </Button>
        {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
          <Button
            key={key}
            variant={priorityFilter === key ? "default" : "outline"}
            size="sm"
            onClick={() => setPriorityFilter(priorityFilter === key ? "" : key)}
            className={`h-7 text-xs ${cfg.text} border-current`}
          >
            {key}
          </Button>
        ))}
      </div>

      {/* Decisions */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-cyan-400" />
            כל ההחלטות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-440px)] pr-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-white/40">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>אין החלטות להצגה</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((d) => {
                  const prio = PRIORITY_CONFIG[d.priority] ?? PRIORITY_CONFIG.low!;
                  const status = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending_eval!;
                  const StatusIcon = status.icon;
                  return (
                    <div key={d.id} className={`rounded-lg border p-4 ${prio.bg} ${prio.border}`}>
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <Brain className={`w-6 h-6 ${prio.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <div className="font-bold text-base">{d.title}</div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`${prio.text} border-current text-[10px]`}>
                                {d.priority}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                ציון {d.score.toFixed(0)}
                              </Badge>
                              {d.autoExecutable && (
                                <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-[10px]">
                                  <Zap className="w-3 h-3 ml-0.5" /> אוטו׳
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-white/70">{d.summary}</div>
                          <div className="flex items-center gap-3 mt-2 text-xs">
                            <span className="flex items-center gap-1">
                              <StatusIcon className={`w-3 h-3 ${status.color}`} />
                              <span className={status.color}>{status.label}</span>
                            </span>
                            <span className="text-white/50">·</span>
                            <span className="text-white/60">{d.category}</span>
                            <span className="text-white/50">·</span>
                            <span className="text-white/60">{d.actionType}</span>
                          </div>

                          {/* Profit impact */}
                          {d.estimatedProfitImpact != null && (
                            <div className="mt-2 flex items-center gap-4 p-2 rounded bg-white/5 border border-white/10 text-xs">
                              <div>
                                <div className="text-white/50 text-[10px]">רווח צפוי</div>
                                <div className={`font-bold ${d.estimatedProfitImpact >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {d.estimatedProfitImpact >= 0 ? "+" : ""}₪{d.estimatedProfitImpact.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                                </div>
                              </div>
                              {d.estimatedRevenueImpact != null && (
                                <div>
                                  <div className="text-white/50 text-[10px]">הכנסה</div>
                                  <div className="font-semibold text-green-300">
                                    ₪{d.estimatedRevenueImpact.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                                  </div>
                                </div>
                              )}
                              {d.estimatedCostImpact != null && (
                                <div>
                                  <div className="text-white/50 text-[10px]">עלות</div>
                                  <div className="font-semibold text-orange-300">
                                    ₪{d.estimatedCostImpact.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                                  </div>
                                </div>
                              )}
                              {d.confidence != null && (
                                <div>
                                  <div className="text-white/50 text-[10px]">ביטחון</div>
                                  <div className="font-semibold">{(d.confidence * 100).toFixed(0)}%</div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action buttons */}
                          {d.status === "awaiting_approval" && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => approve(d.id)}
                              >
                                <CheckCheck className="w-4 h-4 ml-1" />
                                אשר ובצע
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                                onClick={() => reject(d.id)}
                              >
                                <X className="w-4 h-4 ml-1" />
                                דחה
                              </Button>
                              {d.expiresAt && (
                                <span className="text-[10px] text-white/50 self-center mr-2">
                                  פג ב-{new Date(d.expiresAt).toLocaleDateString("he-IL")}
                                </span>
                              )}
                            </div>
                          )}

                          {d.executionResult && (
                            <div className={`mt-2 p-2 rounded text-xs ${
                              d.executionResult.success ? "bg-green-500/10 border border-green-500/30 text-green-300"
                                                        : "bg-red-500/10 border border-red-500/30 text-red-300"
                            }`}>
                              {d.executionResult.success ? <CheckCircle2 className="w-3 h-3 inline ml-1" /> : <XCircle className="w-3 h-3 inline ml-1" />}
                              {d.executionResult.message}
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
