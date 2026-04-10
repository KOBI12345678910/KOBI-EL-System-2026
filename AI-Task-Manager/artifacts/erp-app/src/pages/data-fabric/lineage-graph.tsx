/**
 * Data Lineage Graph — full provenance across sources, datasets, pipelines, products.
 */

import { useState } from "react";
import { useLineage } from "@/hooks/useDataFabric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Network, Database, Zap, Package, Eye, Search, ArrowRight,
  GitBranch, BarChart3, Brain, Layers
} from "lucide-react";

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  source: { label: "מקור", icon: Database, color: "text-blue-400" },
  dataset: { label: "Dataset", icon: Layers, color: "text-green-400" },
  pipeline: { label: "Pipeline", icon: Zap, color: "text-yellow-400" },
  transform: { label: "Transform", icon: GitBranch, color: "text-cyan-400" },
  product: { label: "Data Product", icon: Package, color: "text-purple-400" },
  ontology: { label: "Ontology", icon: Brain, color: "text-pink-400" },
  dashboard: { label: "Dashboard", icon: BarChart3, color: "text-orange-400" },
  model: { label: "Model", icon: Brain, color: "text-red-400" },
};

export default function LineageGraph() {
  const { data } = useLineage();
  const [search, setSearch] = useState("");
  const edges = data?.edges ?? [];
  const summary = data?.summary ?? { nodes: 0, edges: 0 };

  const filtered = search
    ? edges.filter(e =>
        e.fromLabel?.toLowerCase().includes(search.toLowerCase()) ||
        e.toLabel?.toLowerCase().includes(search.toLowerCase()) ||
        e.fromId.includes(search) ||
        e.toId.includes(search)
      )
    : edges;

  // Group by from node
  const byFrom: Record<string, typeof edges> = {};
  for (const e of filtered) {
    const key = `${e.fromType}:${e.fromId}`;
    if (!byFrom[key]) byFrom[key] = [];
    byFrom[key]!.push(e);
  }

  const typeBreakdown: Record<string, number> = {};
  for (const e of edges) {
    typeBreakdown[e.fromType] = (typeBreakdown[e.fromType] ?? 0) + 1;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Network className="w-7 h-7 text-cyan-400" />
          Data Lineage — מעקב מוצא
        </h1>
        <p className="text-white/60 text-sm mt-1">
          גרף הפרובננס של כל הנתונים — מאיפה הם באים, איך הם מתמרים, לאן הם זורמים.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Network} label="צמתים" value={summary.nodes} color="text-cyan-400" />
        <StatCard icon={GitBranch} label="קשרים" value={summary.edges} color="text-green-400" />
        <StatCard icon={Database} label="מקורות" value={typeBreakdown.source ?? 0} color="text-blue-400" />
        <StatCard icon={Layers} label="datasets" value={typeBreakdown.dataset ?? 0} color="text-purple-400" />
      </div>

      {/* Search */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-white/40" />
            <Input
              placeholder="חיפוש ב-lineage..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#0a0e1a] border-white/10 text-white pr-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lineage Chains */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-cyan-400" />
            זרמי נתונים ({filtered.length} קשרים)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-420px)] pr-2">
            {Object.entries(byFrom).length === 0 ? (
              <div className="text-center py-16 text-white/40">
                <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>אין נתוני lineage להצגה</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(byFrom).map(([fromKey, fromEdges]) => {
                  const first = fromEdges[0]!;
                  const fromCfg = TYPE_CONFIG[first.fromType] ?? TYPE_CONFIG.dataset!;
                  const FromIcon = fromCfg.icon;
                  return (
                    <div key={fromKey} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2 mb-2">
                        <FromIcon className={`w-4 h-4 ${fromCfg.color}`} />
                        <div className="font-semibold text-sm">{first.fromLabel ?? first.fromId}</div>
                        <Badge variant="outline" className="text-[10px]">{fromCfg.label}</Badge>
                      </div>
                      <div className="space-y-1 mr-4">
                        {fromEdges.map((e) => {
                          const toCfg = TYPE_CONFIG[e.toType] ?? TYPE_CONFIG.dataset!;
                          const ToIcon = toCfg.icon;
                          return (
                            <div key={e.id} className="flex items-center gap-2 text-xs text-white/70 p-2 rounded bg-white/5 hover:bg-white/10">
                              <ArrowRight className="w-3 h-3 opacity-50 shrink-0" />
                              <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                                {e.relationship}
                              </Badge>
                              <ToIcon className={`w-3 h-3 ${toCfg.color} shrink-0`} />
                              <span className="truncate">{e.toLabel ?? e.toId}</span>
                              <span className="ml-auto text-[9px] opacity-40 shrink-0">{toCfg.label}</span>
                            </div>
                          );
                        })}
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

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
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
