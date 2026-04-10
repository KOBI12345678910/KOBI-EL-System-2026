/**
 * Identity Resolution — resolved clusters across sources.
 *
 * Shows how "the same customer" from ERP + CRM + Excel is unified.
 */

import { useState } from "react";
import { useIdentityClusters } from "@/hooks/useDataFabric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GitBranch, Users, Truck, Package, Database, Shield, CheckCircle2, AlertTriangle, Link2
} from "lucide-react";

const ENTITY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  customer: { label: "לקוחות", icon: Users, color: "text-blue-400" },
  supplier: { label: "ספקים", icon: Truck, color: "text-orange-400" },
  product: { label: "מוצרים", icon: Package, color: "text-green-400" },
  employee: { label: "עובדים", icon: Users, color: "text-purple-400" },
  order: { label: "הזמנות", icon: Database, color: "text-cyan-400" },
  invoice: { label: "חשבוניות", icon: Database, color: "text-yellow-400" },
};

export default function IdentityResolutionPage() {
  const [entityFilter, setEntityFilter] = useState<string>("");
  const { data } = useIdentityClusters(entityFilter || undefined);
  const clusters = data?.clusters ?? [];
  const stats = data?.stats ?? { totalClusters: 0, totalLinks: 0, multiSourceClusters: 0, avgConfidence: 0 };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <GitBranch className="w-7 h-7 text-purple-400" />
          Identity Resolution — איחוד זהויות
        </h1>
        <p className="text-white/60 text-sm mt-1">
          "אותו לקוח" שמופיע ב-ERP, CRM ו-Excel — מאוחד לישות קנונית אחת עם ביטחון ומקור נגזר.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={GitBranch} label="אשכולות מאוחדים" value={stats.totalClusters} color="text-purple-400" />
        <StatCard icon={Link2} label="קישורים" value={stats.totalLinks} color="text-cyan-400" />
        <StatCard icon={Database} label="חוצי מקור" value={stats.multiSourceClusters} color="text-green-400" />
        <StatCard icon={Shield} label="ביטחון ממוצע" value={`${((stats.avgConfidence ?? 0) * 100).toFixed(0)}%`} color="text-yellow-400" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setEntityFilter("")}
          className={`px-3 py-1.5 rounded-lg text-xs border transition ${
            entityFilter === "" ? "bg-white/10 border-white/30" : "bg-white/5 border-white/10 hover:bg-white/10"
          }`}
        >
          הכל ({clusters.length})
        </button>
        {Object.entries(ENTITY_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setEntityFilter(entityFilter === key ? "" : key)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition flex items-center gap-1.5 ${
                entityFilter === key ? "bg-white/10 border-white/30" : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <Icon className={`w-3 h-3 ${cfg.color}`} />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Clusters */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-400" />
            אשכולות זהות מאוחדים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-440px)] pr-2">
            {clusters.length === 0 ? (
              <div className="text-center py-16 text-white/40">
                <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>אין אשכולות זהות להצגה</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clusters.map((cluster) => {
                  const cfg = ENTITY_CONFIG[cluster.canonicalEntity] ?? ENTITY_CONFIG.customer!;
                  const Icon = cfg.icon;
                  const isMultiSource = cluster.sourceCount > 1;
                  return (
                    <div
                      key={cluster.id}
                      className={`rounded-lg border p-4 ${
                        isMultiSource ? "bg-green-500/5 border-green-500/30" : "bg-white/5 border-white/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <Icon className={`w-5 h-5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-bold">
                              {(cluster.canonicalAttributes as any)?.name ?? cluster.canonicalId}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{cfg.label}</Badge>
                              <Badge variant="outline" className={`text-[10px] ${
                                isMultiSource ? "border-green-500/40 text-green-300" : "border-blue-500/40 text-blue-300"
                              }`}>
                                {cluster.sourceCount} מקור{cluster.sourceCount > 1 ? "ות" : ""}
                              </Badge>
                              {cluster.confidence != null && (
                                <Badge variant="outline" className="text-[10px]">
                                  <Shield className="w-2.5 h-2.5 ml-0.5" />
                                  {(cluster.confidence * 100).toFixed(0)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-white/60 mt-1 font-mono">{cluster.canonicalId}</div>

                          {/* Attributes */}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {Object.entries(cluster.canonicalAttributes).slice(0, 5).map(([k, v]) => (
                              <div key={k} className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                                <span className="text-white/50">{k}:</span> <span className="text-white/90">{String(v)}</span>
                              </div>
                            ))}
                          </div>

                          {/* Links */}
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <div className="text-[10px] uppercase text-white/50 mb-2 font-semibold">קישורים למקורות</div>
                            <div className="space-y-1">
                              {cluster.links.map((link, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-white/70 p-2 rounded bg-white/5">
                                  <Database className="w-3 h-3 text-blue-400 shrink-0" />
                                  <span className="font-mono text-[10px]">source-{link.sourceId}</span>
                                  <span className="opacity-50">·</span>
                                  <span className="font-mono text-[10px]">{link.sourceRecordId}</span>
                                  {link.matchScore != null && (
                                    <Badge variant="outline" className="text-[9px] mr-auto">
                                      התאמה {(link.matchScore * 100).toFixed(0)}%
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
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
