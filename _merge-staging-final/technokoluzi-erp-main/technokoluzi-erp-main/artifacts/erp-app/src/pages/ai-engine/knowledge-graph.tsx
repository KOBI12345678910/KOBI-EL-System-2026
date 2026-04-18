import { useState, useEffect } from "react";
import {
  Search, Network, GitBranch, Database, Activity, Layers,
  Plus, RefreshCw, ArrowRight, Circle, Zap, BarChart3, Clock
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { authFetch } from "@/lib/utils";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

interface KGNode {
  id: number;
  entity_type: string;
  entity_id: string;
  label: string;
  properties: Record<string, any>;
  depth?: number;
  relevance_score?: number;
  created_at: string;
}

interface KGEdge {
  id: number;
  source_node_id: number;
  target_node_id: number;
  relation_type: string;
  weight: number;
}

interface DashboardStats {
  total_nodes: number;
  total_edges: number;
  entity_types: { entity_type: string; count: number }[];
  recent_queries: { id: number; query_text: string; query_type: string; results_count: number; execution_time_ms: number; created_at: string }[];
  top_relations: { relation_type: string; count: number }[];
  recent_nodes: KGNode[];
}

export default function KnowledgeGraphPage() {
  const [tab, setTab] = useState<"dashboard" | "search" | "traverse" | "build">("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KGNode[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [traverseNodeId, setTraverseNodeId] = useState("");
  const [traverseDepth, setTraverseDepth] = useState("2");
  const [traverseResult, setTraverseResult] = useState<{ nodes: KGNode[]; edges: KGEdge[] } | null>(null);
  const [traverseLoading, setTraverseLoading] = useState(false);
  const [buildEntity, setBuildEntity] = useState("");
  const [buildTable, setBuildTable] = useState("");
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildResult, setBuildResult] = useState<any>(null);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/knowledge-graph/dashboard`, { headers: headers() });
      const d = await r.json();
      setStats(d);
    } catch { setStats(null); }
    setLoading(false);
  }

  async function doSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const r = await authFetch(`${API}/knowledge-graph/search?q=${encodeURIComponent(searchQuery)}`, { headers: headers() });
      const d = await r.json();
      setSearchResults(d.results || []);
    } catch { setSearchResults([]); }
    setSearchLoading(false);
  }

  async function doTraverse() {
    if (!traverseNodeId) return;
    setTraverseLoading(true);
    try {
      const r = await authFetch(`${API}/knowledge-graph/traverse/${traverseNodeId}?depth=${traverseDepth}`, { headers: headers() });
      const d = await r.json();
      setTraverseResult(d);
    } catch { setTraverseResult(null); }
    setTraverseLoading(false);
  }

  async function doBuild() {
    if (!buildEntity || !buildTable) return;
    setBuildLoading(true);
    try {
      const r = await authFetch(`${API}/knowledge-graph/build-from-entity`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ entity_type: buildEntity, source_table: buildTable }),
      });
      const d = await r.json();
      setBuildResult(d);
      loadDashboard();
    } catch { setBuildResult({ error: "שגיאה בבניית גרף" }); }
    setBuildLoading(false);
  }

  const TABS = [
    { key: "dashboard", label: "לוח בקרה", icon: BarChart3 },
    { key: "search", label: "חיפוש", icon: Search },
    { key: "traverse", label: "סריקת גרף", icon: GitBranch },
    { key: "build", label: "בניית גרף", icon: Plus },
  ] as const;

  const typeColorMap: Record<string, string> = {
    customer: "bg-blue-500/20 text-blue-400",
    lead: "bg-emerald-500/20 text-emerald-400",
    product: "bg-purple-500/20 text-purple-400",
    invoice: "bg-amber-500/20 text-amber-400",
    supplier: "bg-pink-500/20 text-pink-400",
    employee: "bg-cyan-500/20 text-cyan-400",
  };

  function getTypeColor(type: string) {
    return typeColorMap[type.toLowerCase()] || "bg-muted/40 text-muted-foreground";
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Network className="w-7 h-7 text-primary" />
              גרף ידע ארגוני
            </h1>
            <p className="text-muted-foreground text-sm mt-1">ניתוח קשרים בין ישויות עסקיות, חיפוש וסריקה חכמה</p>
          </div>
          <button onClick={loadDashboard} className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition">
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border/50 pb-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition
                ${tab === t.key ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/20"}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {tab === "dashboard" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: "צמתים", value: stats?.total_nodes || 0, icon: Circle, color: "text-blue-400" },
                { label: "קשתות", value: stats?.total_edges || 0, icon: GitBranch, color: "text-emerald-400" },
                { label: "סוגי ישויות", value: stats?.entity_types?.length || 0, icon: Layers, color: "text-purple-400" },
                { label: "שאילתות אחרונות", value: stats?.recent_queries?.length || 0, icon: Activity, color: "text-amber-400" },
              ].map((kpi, i) => (
                <div key={i} className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground text-sm">{kpi.label}</span>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  <div className="text-3xl font-bold">{kpi.value.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Entity Types + Relations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-primary" /> סוגי ישויות</h3>
                {(stats?.entity_types || []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">אין נתונים עדיין</p>
                ) : (
                  <div className="space-y-2">
                    {stats!.entity_types.map((et, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                        <span className={`text-sm px-2 py-0.5 rounded ${getTypeColor(et.entity_type)}`}>{et.entity_type}</span>
                        <span className="text-sm font-bold">{Number(et.count).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> סוגי קשרים מובילים</h3>
                {(stats?.top_relations || []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">אין קשרים עדיין</p>
                ) : (
                  <div className="space-y-2">
                    {stats!.top_relations.map((r, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                        <span className="text-sm">{r.relation_type}</span>
                        <span className="text-sm font-bold">{Number(r.count).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Queries */}
            <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> שאילתות אחרונות</h3>
              {(stats?.recent_queries || []).length === 0 ? (
                <p className="text-muted-foreground text-sm">לא בוצעו שאילתות עדיין</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/30">
                        <th className="text-right p-2">שאילתה</th>
                        <th className="text-right p-2">סוג</th>
                        <th className="text-right p-2">תוצאות</th>
                        <th className="text-right p-2">זמן (ms)</th>
                        <th className="text-right p-2">תאריך</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats!.recent_queries.map(q => (
                        <tr key={q.id} className="border-b border-border/10 hover:bg-muted/10">
                          <td className="p-2 font-mono text-xs">{q.query_text}</td>
                          <td className="p-2"><span className="px-2 py-0.5 rounded bg-muted/30 text-xs">{q.query_type}</span></td>
                          <td className="p-2">{q.results_count}</td>
                          <td className="p-2">{q.execution_time_ms}</td>
                          <td className="p-2 text-muted-foreground">{new Date(q.created_at).toLocaleDateString("he-IL")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search Tab */}
        {tab === "search" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="חיפוש חופשי בגרף הידע..." dir="rtl"
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <button onClick={doSearch} disabled={searchLoading}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50">
                {searchLoading ? "מחפש..." : "חפש"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
                <h3 className="font-semibold mb-3">נמצאו {searchResults.length} תוצאות</h3>
                <div className="space-y-2">
                  {searchResults.map(node => (
                    <div key={node.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition cursor-pointer"
                      onClick={() => { setTraverseNodeId(String(node.id)); setTab("traverse"); }}>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${getTypeColor(node.entity_type)}`}>{node.entity_type}</span>
                        <span className="font-medium">{node.label}</span>
                        {node.entity_id && <span className="text-muted-foreground text-xs">#{node.entity_id}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {node.relevance_score && (
                          <span className="text-xs text-muted-foreground">רלוונטיות: {node.relevance_score}%</span>
                        )}
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Traverse Tab */}
        {tab === "traverse" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm text-muted-foreground mb-1 block">מזהה צומת</label>
                <input value={traverseNodeId} onChange={e => setTraverseNodeId(e.target.value)}
                  placeholder="הכנס מזהה צומת..." className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="w-32">
                <label className="text-sm text-muted-foreground mb-1 block">עומק</label>
                <select value={traverseDepth} onChange={e => setTraverseDepth(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none">
                  {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={doTraverse} disabled={traverseLoading}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50">
                {traverseLoading ? "סורק..." : "סרוק"}
              </button>
            </div>

            {traverseResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-blue-400">{traverseResult.nodes.length}</div>
                    <div className="text-sm text-muted-foreground">צמתים נמצאו</div>
                  </div>
                  <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-400">{traverseResult.edges.length}</div>
                    <div className="text-sm text-muted-foreground">קשתות</div>
                  </div>
                </div>

                <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
                  <h3 className="font-semibold mb-3">צמתים מחוברים</h3>
                  <div className="space-y-2">
                    {traverseResult.nodes.map(node => (
                      <div key={node.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${getTypeColor(node.entity_type)}`}>{node.entity_type}</span>
                          <span className="font-medium">{node.label}</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-muted/30 text-muted-foreground">עומק {node.depth ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Build Tab */}
        {tab === "build" && (
          <div className="space-y-4">
            <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> בניית גרף אוטומטית מטבלה</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">סוג ישות</label>
                  <input value={buildEntity} onChange={e => setBuildEntity(e.target.value)}
                    placeholder="לדוגמה: customer, product..." className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">טבלת מקור</label>
                  <input value={buildTable} onChange={e => setBuildTable(e.target.value)}
                    placeholder="לדוגמה: customers, products..." className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <button onClick={doBuild} disabled={buildLoading || !buildEntity || !buildTable}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50">
                {buildLoading ? "בונה גרף..." : "בנה גרף"}
              </button>
              {buildResult && (
                <div className={`p-4 rounded-lg ${buildResult.error ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                  {buildResult.error ? buildResult.error : `נוצרו ${buildResult.nodes_created} צמתים ו-${buildResult.edges_created} קשתות מ-${buildResult.source_records} רשומות`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
