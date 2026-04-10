/**
 * Causal Impact Viewer — visualize ripple effects through the company.
 *
 * Every significant event creates an impact chain. This page shows those
 * chains so operators can see "when X happens, Y, Z, and W are affected".
 */

import { useState } from "react";
import { useImpactChains, useCausalDownstream, useLiveEvents } from "@/hooks/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, ArrowRight, ArrowDown, AlertTriangle, Flame, Network,
  GitBranch, Zap, ChevronRight, Eye, Target, Clock
} from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-500/10 border-blue-500/30 text-blue-300",
  success: "bg-green-500/10 border-green-500/30 text-green-300",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
  critical: "bg-red-500/10 border-red-500/30 text-red-300",
  blocker: "bg-red-600/15 border-red-600/50 text-red-200",
};

export default function CausalImpactViewer() {
  const { data: chains = [] } = useImpactChains();
  const { data: recentEvents = [] } = useLiveEvents({ limit: 100 });
  const [selectedRootType, setSelectedRootType] = useState<string>("");
  const [selectedRootId, setSelectedRootId] = useState<string>("");
  const { data: manualChain = [] } = useCausalDownstream(selectedRootType || undefined, selectedRootId || undefined, 4);

  // Build unique entities from events for selection
  const availableEntities = Array.from(
    new Map(
      recentEvents.map(e => [`${e.entityType}:${e.entityId}`, { type: e.entityType, id: e.entityId, label: e.entityLabel ?? e.entityId }])
    ).values()
  ).slice(0, 20);

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Network className="w-7 h-7 text-orange-400" />
          ניתוח השפעות סיבתיות
        </h1>
        <p className="text-white/60 text-sm mt-1">
          כשאירוע מתרחש, אילו ישויות מושפעות במורד הזרם. זה הלב של ה-Causal Intelligence.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Flame}
          label="רשתות השפעה פעילות"
          value={chains.length}
          color="text-orange-400"
        />
        <StatCard
          icon={Target}
          label="סה״כ ישויות מושפעות"
          value={chains.reduce((sum, c) => sum + c.totalImpacted, 0)}
          color="text-red-400"
        />
        <StatCard
          icon={AlertTriangle}
          label="רשתות קריטיות"
          value={chains.filter(c => c.maxSeverity === "critical" || c.maxSeverity === "blocker").length}
          color="text-red-500"
        />
        <StatCard
          icon={GitBranch}
          label="עומק ממוצע"
          value={chains.length > 0 ? (chains.reduce((sum, c) => sum + Math.max(...c.chain.map(n => n.depth), 0), 0) / chains.length).toFixed(1) : "—"}
          color="text-cyan-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Impact Chains */}
        <Card className="lg:col-span-2 bg-[#0f1420] border-orange-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-300">
              <Zap className="w-5 h-5" />
              רשתות השפעה שזוהו לאחרונה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-2">
              {chains.length === 0 ? (
                <div className="text-center py-16 text-white/40">
                  <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>אין רשתות השפעה נוכחיות</p>
                  <p className="text-xs mt-1">יופיע כאן כשאירוע קריטי יזוהה</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chains.map((chain) => (
                    <div
                      key={chain.rootEventId}
                      className={`rounded-lg border p-4 ${SEVERITY_COLORS[chain.maxSeverity] ?? SEVERITY_COLORS.info}`}
                    >
                      {/* Root */}
                      <div className="flex items-start gap-3 pb-3 border-b border-white/10">
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <Flame className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs opacity-60">מקור האירוע</div>
                          <div className="font-bold truncate">
                            {chain.rootEntityType}: {chain.rootEntityId}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">
                              {chain.totalImpacted} מושפעות
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              חומרה מקס׳ {chain.maxSeverity}
                            </Badge>
                            <span className="text-[10px] opacity-60">
                              {new Date(chain.computedAt).toLocaleTimeString("he-IL")}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Chain visualization */}
                      <div className="mt-3 space-y-1">
                        {chain.chain.slice(0, 10).map((node, i) => (
                          <div
                            key={`${node.entityType}-${node.entityId}-${i}`}
                            className="flex items-center gap-2 text-xs"
                            style={{ paddingRight: `${node.depth * 16}px` }}
                          >
                            {node.depth > 0 && <ArrowDown className="w-3 h-3 opacity-50 shrink-0" />}
                            <div className={`px-2 py-1 rounded border ${SEVERITY_COLORS[node.severity] ?? SEVERITY_COLORS.info} flex-1 min-w-0`}>
                              <div className="flex items-center gap-2">
                                <span className="opacity-60">L{node.depth}</span>
                                <span className="font-semibold truncate">
                                  {node.entityLabel ?? `${node.entityType}:${node.entityId}`}
                                </span>
                                <span className="opacity-50 text-[10px] ml-auto">{node.impactType}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {chain.chain.length > 10 && (
                          <div className="text-[10px] opacity-60 text-center pt-1">
                            + {chain.chain.length - 10} נוספות...
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Manual Explorer */}
        <Card className="bg-[#0f1420] border-cyan-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-300">
              <Eye className="w-5 h-5" />
              חקור ישות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="text-xs text-white/60">בחר ישות לניתוח:</div>
              <ScrollArea className="h-[200px] pr-2">
                <div className="space-y-1">
                  {availableEntities.map((ent) => (
                    <button
                      key={`${ent.type}:${ent.id}`}
                      onClick={() => {
                        setSelectedRootType(ent.type);
                        setSelectedRootId(ent.id);
                      }}
                      className={`w-full text-right p-2 rounded border text-xs ${
                        selectedRootType === ent.type && selectedRootId === ent.id
                          ? "bg-cyan-500/20 border-cyan-500/50"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div className="truncate font-semibold">{ent.label}</div>
                      <div className="truncate opacity-50 text-[10px]">{ent.type}:{ent.id}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {selectedRootType && selectedRootId && (
              <div className="pt-3 border-t border-white/10">
                <div className="text-xs text-cyan-400/80 mb-2 font-semibold">רשת השפעה:</div>
                {manualChain.length === 0 ? (
                  <div className="text-xs text-white/40 text-center py-4">
                    אין תלויות במורד הזרם
                  </div>
                ) : (
                  <div className="space-y-1">
                    {manualChain.map((node, i) => (
                      <div
                        key={`${node.entityType}-${node.entityId}-${i}`}
                        className={`px-2 py-1.5 rounded border text-xs ${SEVERITY_COLORS[node.severity] ?? SEVERITY_COLORS.info}`}
                        style={{ marginRight: `${node.depth * 12}px` }}
                      >
                        <div className="flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 opacity-50" />
                          <span className="font-semibold truncate">
                            {node.entityLabel ?? `${node.entityType}:${node.entityId}`}
                          </span>
                        </div>
                        <div className="text-[10px] opacity-60 mr-4">{node.impactType}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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
