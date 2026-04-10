/**
 * Data Fabric Overview — the heart of the data foundation.
 *
 * Shows connectors health, ingestion stats, datasets by zone, quality,
 * freshness, identity clusters, lineage graph size, data products.
 */

import { useFabricOverview, useDataSources, useFabricDatasets, useDataProducts } from "@/hooks/useDataFabric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Database, Zap, Layers, GitBranch, Shield, Clock, Activity,
  CheckCircle2, AlertTriangle, Package, TrendingUp, Network
} from "lucide-react";

const ZONE_COLORS: Record<string, string> = {
  raw: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  staging: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  curated: "bg-green-500/10 text-green-300 border-green-500/30",
  ontology: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  realtime: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  historical: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  event_store: "bg-pink-500/10 text-pink-300 border-pink-500/30",
};

export default function DataFabricOverviewPage() {
  const { data: overview } = useFabricOverview();
  const { data: sourcesData } = useDataSources();
  const { data: datasetsData } = useFabricDatasets();
  const { data: products = [] } = useDataProducts();

  const sources = sourcesData?.sources ?? [];
  const datasets = datasetsData?.datasets ?? [];
  const health = overview?.connectors ?? { total: 0, active: 0, failed: 0, paused: 0, avgHealth: 100 };
  const ingestion = overview?.ingestion ?? { total: 0, success: 0, failed: 0, running: 0, successRate: 0, totalRowsIngested: 0 };
  const quality = overview?.quality ?? { passRate: 0, activeRules: 0, pass: 0, warn: 0, fail: 0, error: 0 };
  const freshness = overview?.freshness ?? { total: 0, fresh: 0, warning: 0, stale: 0, missing: 0 };
  const identity = overview?.identity ?? { totalClusters: 0, totalLinks: 0, multiSourceClusters: 0, avgConfidence: 0 };
  const lineage = overview?.lineage ?? { nodes: 0, edges: 0 };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Database className="w-7 h-7 text-purple-400" />
          Data Fabric — שכבת הנתונים המאוחדת
        </h1>
        <p className="text-white/60 text-sm mt-1">
          חיבור כל המערכות של הארגון ל-data fabric אחיד עם lineage, identity resolution, canonical model, ו-quality gates.
        </p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Database} label="מקורות נתונים" value={health.total} subValue={`${health.active} פעילים`} color="text-blue-400" />
        <StatCard icon={Layers} label="datasets" value={datasets.length} subValue={`${(datasets.reduce((s, d) => s + (d.rowCount ?? 0), 0) / 1e6).toFixed(1)}M שורות`} color="text-green-400" />
        <StatCard icon={Package} label="Data Products" value={products.length} subValue={`${products.filter(p => p.status === "ga").length} GA`} color="text-purple-400" />
        <StatCard icon={Network} label="Lineage edges" value={lineage.edges} subValue={`${lineage.nodes} צמתים`} color="text-cyan-400" />
      </div>

      {/* Source Health + Quality + Freshness */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Source Health */}
        <Card className="bg-[#0f1420] border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-300 text-base">
              <Activity className="w-4 h-4" />
              בריאות מקורות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-blue-400 mb-2">{health.avgHealth.toFixed(0)}%</div>
            <Progress value={health.avgHealth} className="h-2 mb-3" />
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="text-green-400 font-bold">{health.active}</div>
                <div className="text-white/50">פעיל</div>
              </div>
              <div className="text-center">
                <div className="text-yellow-400 font-bold">{health.paused}</div>
                <div className="text-white/50">מושהה</div>
              </div>
              <div className="text-center">
                <div className="text-red-400 font-bold">{health.failed}</div>
                <div className="text-white/50">שבור</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quality */}
        <Card className="bg-[#0f1420] border-green-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-green-300 text-base">
              <Shield className="w-4 h-4" />
              איכות נתונים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-400 mb-2">{quality.passRate.toFixed(0)}%</div>
            <Progress value={quality.passRate} className="h-2 mb-3" />
            <div className="grid grid-cols-4 gap-1 text-[10px]">
              <div className="text-center">
                <div className="text-green-400 font-bold">{quality.pass}</div>
                <div className="text-white/50">PASS</div>
              </div>
              <div className="text-center">
                <div className="text-yellow-400 font-bold">{quality.warn}</div>
                <div className="text-white/50">WARN</div>
              </div>
              <div className="text-center">
                <div className="text-red-400 font-bold">{quality.fail}</div>
                <div className="text-white/50">FAIL</div>
              </div>
              <div className="text-center">
                <div className="text-purple-400 font-bold">{quality.activeRules}</div>
                <div className="text-white/50">כללים</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Freshness */}
        <Card className="bg-[#0f1420] border-cyan-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-cyan-300 text-base">
              <Clock className="w-4 h-4" />
              רעננות נתונים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-cyan-400 mb-2">
              {freshness.total > 0 ? Math.round((freshness.fresh / freshness.total) * 100) : 0}%
            </div>
            <Progress value={freshness.total > 0 ? (freshness.fresh / freshness.total) * 100 : 0} className="h-2 mb-3" />
            <div className="grid grid-cols-4 gap-1 text-[10px]">
              <div className="text-center">
                <div className="text-green-400 font-bold">{freshness.fresh}</div>
                <div className="text-white/50">טרי</div>
              </div>
              <div className="text-center">
                <div className="text-yellow-400 font-bold">{freshness.warning}</div>
                <div className="text-white/50">אזהרה</div>
              </div>
              <div className="text-center">
                <div className="text-red-400 font-bold">{freshness.stale}</div>
                <div className="text-white/50">מיושן</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400 font-bold">{freshness.missing}</div>
                <div className="text-white/50">חסר</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Identity + Ingestion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[#0f1420] border-purple-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-300">
              <GitBranch className="w-5 h-5" />
              Identity Resolution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-3xl font-bold text-purple-400">{identity.totalClusters}</div>
                <div className="text-xs text-white/60">ישויות מאוחדות</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-cyan-400">{identity.totalLinks}</div>
                <div className="text-xs text-white/60">קישורים</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-green-400">{identity.multiSourceClusters}</div>
                <div className="text-xs text-white/60">חוצי מקור</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-yellow-400">{((identity.avgConfidence ?? 0) * 100).toFixed(0)}%</div>
                <div className="text-xs text-white/60">ביטחון</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0f1420] border-cyan-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-300">
              <Zap className="w-5 h-5" />
              Ingestion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-3xl font-bold text-cyan-400">{ingestion.total}</div>
                <div className="text-xs text-white/60">ריצות</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-green-400">{ingestion.success}</div>
                <div className="text-xs text-white/60">הצליחו</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-red-400">{ingestion.failed}</div>
                <div className="text-xs text-white/60">נכשלו</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-yellow-400">{ingestion.successRate.toFixed(0)}%</div>
                <div className="text-xs text-white/60">שיעור הצלחה</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Datasets by Zone */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-400" />
            datasets לפי zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {["raw", "staging", "curated", "ontology", "realtime", "historical", "event_store"].map(zone => {
              const count = datasets.filter(d => d.zone === zone).length;
              const rows = datasets.filter(d => d.zone === zone).reduce((s, d) => s + (d.rowCount ?? 0), 0);
              return (
                <div key={zone} className={`p-3 rounded-lg border ${ZONE_COLORS[zone] ?? ZONE_COLORS.raw}`}>
                  <div className="text-xs uppercase font-bold opacity-80">{zone}</div>
                  <div className="text-2xl font-bold mt-1">{count}</div>
                  <div className="text-[10px] opacity-60 mt-1">
                    {rows > 1e6 ? `${(rows / 1e6).toFixed(1)}M` : rows > 1e3 ? `${(rows / 1e3).toFixed(0)}K` : rows} שורות
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Data Sources Grid */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            מקורות נתונים פעילים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.slice(0, 18).map(s => (
              <div key={s.id} className="bg-white/5 rounded-lg border border-white/10 p-3 hover:border-blue-500/40 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{s.name}</div>
                    <div className="text-[10px] text-white/50 mt-0.5">{s.vendor ?? s.sourceType}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${
                    s.status === "active" ? "border-green-500/40 text-green-300" :
                    s.status === "failed" ? "border-red-500/40 text-red-300" :
                    "border-yellow-500/40 text-yellow-300"
                  }`}>
                    {s.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px]">
                  <Badge variant="outline" className="text-[9px] py-0">{s.sourceType}</Badge>
                  {s.healthScore != null && (
                    <span className={`font-bold ${
                      s.healthScore >= 90 ? "text-green-400" :
                      s.healthScore >= 70 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {s.healthScore}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subValue, color }: { icon: any; label: string; value: string | number; subValue?: string; color: string }) {
  return (
    <Card className="bg-[#0f1420] border-white/10">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
          <Icon className={`w-4 h-4 ${color}`} />
          {label}
        </div>
        <div className={`text-3xl font-bold ${color}`}>{value}</div>
        {subValue && <div className="text-[10px] text-white/50 mt-1">{subValue}</div>}
      </CardContent>
    </Card>
  );
}
