/**
 * Canonical Explorer — browse canonical entities merged across sources.
 */

import { useState } from "react";
import { useCanonicalRecords, useEntityTimeline, useAIEntityContext } from "@/hooks/useDataPlatform";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Database, Search, Users, Package, Truck, Building2, Receipt, Factory,
  GitBranch, Clock, Activity, Brain, ArrowRight, Shield
} from "lucide-react";

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  Customer: { label: "Customer", icon: Users, color: "text-blue-400" },
  Supplier: { label: "Supplier", icon: Truck, color: "text-orange-400" },
  Order: { label: "Order", icon: Receipt, color: "text-green-400" },
  Product: { label: "Product", icon: Package, color: "text-cyan-400" },
  StockItem: { label: "StockItem", icon: Package, color: "text-amber-400" },
  ProductionLine: { label: "Production Line", icon: Factory, color: "text-red-400" },
  Project: { label: "Project", icon: Building2, color: "text-indigo-400" },
  Payment: { label: "Payment", icon: Receipt, color: "text-fuchsia-400" },
};

export default function CanonicalExplorer() {
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [searchText, setSearchText] = useState("");

  const { data: allRecords = [] } = useCanonicalRecords(typeFilter || undefined);
  const { data: timeline = [] } = useEntityTimeline(selectedId || undefined);
  const { data: aiContext } = useAIEntityContext(selectedId || undefined);

  const filtered = searchText
    ? allRecords.filter(r =>
        r.canonicalId.toLowerCase().includes(searchText.toLowerCase()) ||
        JSON.stringify(r.properties).toLowerCase().includes(searchText.toLowerCase())
      )
    : allRecords;

  // Type breakdown
  const typeCounts: Record<string, number> = {};
  for (const r of allRecords) typeCounts[r.entityType] = (typeCounts[r.entityType] ?? 0) + 1;

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Database className="w-7 h-7 text-blue-400" />
          Canonical Explorer
        </h1>
        <p className="text-white/60 text-sm mt-1">
          ישויות מאוחדות מכל המערכות — עם source links, properties, timeline, ו-AI context
        </p>
      </div>

      {/* Type filter + search */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-white/40" />
            <Input
              placeholder="חיפוש ישויות..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="bg-[#0a0e1a] border-white/10 text-white pr-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter("")}
              className={`px-3 py-1 rounded text-xs border ${typeFilter === "" ? "bg-white/10 border-white/30" : "bg-white/5 border-white/10"}`}
            >
              הכל ({allRecords.length})
            </button>
            {Object.entries(typeCounts).map(([type, count]) => {
              const cfg = TYPE_CONFIG[type] ?? { label: type, icon: Database, color: "text-gray-400" };
              const Icon = cfg.icon;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(typeFilter === type ? "" : type)}
                  className={`px-3 py-1 rounded text-xs border flex items-center gap-1.5 ${
                    typeFilter === type ? "bg-white/10 border-white/30" : "bg-white/5 border-white/10"
                  }`}
                >
                  <Icon className={`w-3 h-3 ${cfg.color}`} />
                  {type} ({count})
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Entity List */}
        <Card className="bg-[#0f1420] border-white/10 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="w-4 h-4 text-blue-400" />
              ישויות ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-380px)] pr-2">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-white/40">
                  <Database className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>אין ישויות</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.slice(0, 100).map((r) => {
                    const cfg = TYPE_CONFIG[r.entityType] ?? { label: r.entityType, icon: Database, color: "text-gray-400" };
                    const Icon = cfg.icon;
                    const isSelected = selectedId === r.canonicalId;
                    const name = (r.properties["name"] as string) ?? r.canonicalId;
                    return (
                      <button
                        key={r.canonicalId}
                        onClick={() => setSelectedId(r.canonicalId)}
                        className={`w-full text-right p-3 rounded-lg border transition ${
                          isSelected ? "bg-blue-500/15 border-blue-500/50" : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{name}</div>
                            <div className="text-[10px] text-white/50 font-mono truncate">{r.canonicalId}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-[9px] py-0">
                                {r.sourceLinks.length} source{r.sourceLinks.length > 1 ? "s" : ""}
                              </Badge>
                              <Badge variant="outline" className="text-[9px] py-0">
                                {(r.confidence * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Details */}
        <Card className="bg-[#0f1420] border-white/10 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="w-4 h-4 text-purple-400" />
              {selectedId ? `AI Context + Timeline` : "בחר ישות לצפייה"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <div className="text-center py-16 text-white/40">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>בחר ישות מהרשימה כדי לראות את ההקשר המלא שלה</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-380px)] pr-2">
                <div className="space-y-4">
                  {/* AI Context Summary */}
                  {aiContext && aiContext.entity && (
                    <>
                      <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain className="w-4 h-4 text-purple-400" />
                          <div className="font-semibold text-sm">AI Context Packet</div>
                          <Badge variant="outline" className="text-[10px] ml-auto">
                            ~{aiContext.tokenCountEstimate} tokens
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div>
                            <div className="text-white/50 text-[10px]">entity type</div>
                            <div className="font-semibold">{aiContext.entity.entityType}</div>
                          </div>
                          <div>
                            <div className="text-white/50 text-[10px]">risk score</div>
                            <div className={`font-semibold ${
                              aiContext.riskContext.riskScore >= 0.7 ? "text-red-400" :
                              aiContext.riskContext.riskScore >= 0.4 ? "text-yellow-400" :
                              "text-green-400"
                            }`}>
                              {(aiContext.riskContext.riskScore * 100).toFixed(0)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-white/50 text-[10px]">sla</div>
                            <div className="font-semibold">{aiContext.riskContext.slaStatus ?? "—"}</div>
                          </div>
                          <div>
                            <div className="text-white/50 text-[10px]">freshness</div>
                            <div className="font-semibold text-cyan-400">{aiContext.freshness.status}</div>
                          </div>
                        </div>
                        {aiContext.riskContext.blockers.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {aiContext.riskContext.blockers.map((b, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] border-red-500/40 text-red-300">
                                🚫 {b}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Source Links */}
                      <div>
                        <div className="text-xs text-white/50 mb-2 font-semibold uppercase">Source Links</div>
                        <div className="space-y-1">
                          {aiContext.entity.sourceLinks.map((link, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10 text-xs">
                              <Database className="w-3 h-3 text-blue-400" />
                              <span className="font-mono">{link.sourceId}</span>
                              <ArrowRight className="w-3 h-3 text-white/30" />
                              <span className="font-mono">{link.sourceRecordId}</span>
                              {link.matchScore != null && (
                                <Badge variant="outline" className="text-[9px] mr-auto">
                                  {(link.matchScore * 100).toFixed(0)}%
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Properties */}
                      <div>
                        <div className="text-xs text-white/50 mb-2 font-semibold uppercase">Properties</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                          {Object.entries(aiContext.entity.properties)
                            .filter(([k]) => !k.startsWith("__"))
                            .slice(0, 20)
                            .map(([k, v]) => (
                            <div key={k} className="flex gap-2 p-1.5 rounded bg-white/5">
                              <span className="text-white/50 font-mono text-[10px]">{k}:</span>
                              <span className="text-white/90 truncate">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Timeline */}
                  <div>
                    <div className="text-xs text-white/50 mb-2 font-semibold uppercase">Timeline</div>
                    {timeline.length === 0 ? (
                      <div className="text-xs text-white/40 text-center py-4">אין events</div>
                    ) : (
                      <div className="space-y-1">
                        {timeline.map((e) => (
                          <div key={e.eventId} className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10 text-xs">
                            <Activity className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="font-mono font-semibold">{e.eventType}</span>
                            <Badge variant="outline" className="text-[9px]">{e.severity}</Badge>
                            <span className="text-white/40 ml-auto text-[10px]">
                              {new Date(e.timestamp).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
