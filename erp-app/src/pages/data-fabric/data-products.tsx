/**
 * Data Products Catalog — productized datasets with SLA, owner, consumers.
 */

import { useDataProducts } from "@/hooks/useDataFabric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Package, Users, Clock, Shield, Activity, Tag, Building2
} from "lucide-react";

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string }> = {
  draft: { bg: "bg-gray-500/10", border: "border-gray-500/30", text: "text-gray-300" },
  beta: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300" },
  ga: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-300" },
  deprecated: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-300" },
};

export default function DataProductsPage() {
  const { data: products = [] } = useDataProducts();

  const byStatus: Record<string, number> = { draft: 0, beta: 0, ga: 0, deprecated: 0 };
  for (const p of products) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Package className="w-7 h-7 text-purple-400" />
          Data Products Catalog
        </h1>
        <p className="text-white/60 text-sm mt-1">
          datasets מוצריים עם owner, SLA, גרסה, וצרכנים — כמו Palantir Data Products.
        </p>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(byStatus).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft!;
          return (
            <Card key={status} className={`${cfg.bg} border ${cfg.border}`}>
              <CardContent className="p-4 text-center">
                <div className={`text-3xl font-bold ${cfg.text}`}>{count}</div>
                <div className="text-xs text-white/60 mt-1 uppercase">{status}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => {
          const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.draft!;
          return (
            <Card key={p.id} className="bg-[#0f1420] border-white/10 hover:border-purple-500/40 transition">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-purple-400" />
                    <CardTitle className="text-base">{p.name}</CardTitle>
                  </div>
                  <Badge variant="outline" className={`${cfg.text} ${cfg.border} text-[10px]`}>
                    {p.status.toUpperCase()}
                  </Badge>
                </div>
                {p.version && (
                  <div className="text-xs text-white/50 mt-1">v{p.version}</div>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-white/70 line-clamp-2">{p.description}</p>

                {p.teamName && (
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <Building2 className="w-3 h-3" />
                    {p.teamName}
                  </div>
                )}

                {/* SLAs */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                  <div>
                    <div className="text-[10px] text-white/50 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      רעננות
                    </div>
                    <div className="text-xs font-semibold text-cyan-400">{p.freshnessSla ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 flex items-center gap-1">
                      <Activity className="w-2.5 h-2.5" />
                      זמינות
                    </div>
                    <div className="text-xs font-semibold text-green-400">
                      {p.availabilitySla != null ? `${p.availabilitySla}%` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 flex items-center gap-1">
                      <Shield className="w-2.5 h-2.5" />
                      איכות
                    </div>
                    <div className="text-xs font-semibold text-purple-400">
                      {p.qualitySla != null ? `${p.qualitySla}%` : "—"}
                    </div>
                  </div>
                </div>

                {/* Consumers */}
                {p.consumers && p.consumers.length > 0 && (
                  <div className="pt-2 border-t border-white/10">
                    <div className="text-[10px] text-white/50 flex items-center gap-1 mb-1">
                      <Users className="w-2.5 h-2.5" />
                      צרכנים ({p.consumers.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.consumers.slice(0, 3).map((c, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] py-0">{c}</Badge>
                      ))}
                      {p.consumers.length > 3 && (
                        <Badge variant="outline" className="text-[9px] py-0">+{p.consumers.length - 3}</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {p.tags && p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {p.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] py-0 border-cyan-500/30 text-cyan-300">
                        <Tag className="w-2 h-2 ml-0.5" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
