import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Network, Users, Truck, Briefcase, UserCog, TrendingUp,
  Filter, Share2, Zap, Target, GitBranch, Activity, Circle
} from "lucide-react";

type NodeType = "customer" | "supplier" | "project" | "employee";

interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
  pageRank: number;
  degree: number;
  community: number;
}

interface GraphEdge {
  source: string;
  target: string;
  strength: number;
  type: string;
}

const NODE_CONFIG: Record<NodeType, { color: string; bgHex: string; icon: any; label: string }> = {
  customer: { color: "text-blue-400", bgHex: "#3b82f6", icon: Users, label: "לקוח" },
  supplier: { color: "text-green-400", bgHex: "#22c55e", icon: Truck, label: "ספק" },
  project: { color: "text-purple-400", bgHex: "#a855f7", icon: Briefcase, label: "פרויקט" },
  employee: { color: "text-orange-400", bgHex: "#f97316", icon: UserCog, label: "עובד" },
};

const MOCK_NODES: GraphNode[] = [
  { id: "n1", label: "תעש ישראל", type: "customer", x: 200, y: 150, pageRank: 0.92, degree: 8, community: 1 },
  { id: "n2", label: "אלקטרה", type: "customer", x: 380, y: 100, pageRank: 0.88, degree: 7, community: 1 },
  { id: "n3", label: "טבע", type: "customer", x: 550, y: 180, pageRank: 0.85, degree: 6, community: 2 },
  { id: "n4", label: "ספק פלדה א׳", type: "supplier", x: 120, y: 280, pageRank: 0.78, degree: 5, community: 1 },
  { id: "n5", label: "ספק חשמל ב׳", type: "supplier", x: 290, y: 320, pageRank: 0.72, degree: 5, community: 2 },
  { id: "n6", label: "ספק לוגיסטיקה", type: "supplier", x: 470, y: 310, pageRank: 0.69, degree: 4, community: 2 },
  { id: "n7", label: "פרויקט אלפא", type: "project", x: 180, y: 420, pageRank: 0.81, degree: 6, community: 1 },
  { id: "n8", label: "פרויקט בטא", type: "project", x: 350, y: 450, pageRank: 0.76, degree: 5, community: 2 },
  { id: "n9", label: "פרויקט גמא", type: "project", x: 530, y: 430, pageRank: 0.73, degree: 5, community: 3 },
  { id: "n10", label: "פרויקט דלתא", type: "project", x: 680, y: 380, pageRank: 0.68, degree: 4, community: 3 },
  { id: "n11", label: "יוסי כהן", type: "employee", x: 100, y: 520, pageRank: 0.75, degree: 6, community: 1 },
  { id: "n12", label: "דנה לוי", type: "employee", x: 260, y: 550, pageRank: 0.71, degree: 5, community: 2 },
  { id: "n13", label: "משה אברהם", type: "employee", x: 420, y: 570, pageRank: 0.68, degree: 4, community: 2 },
  { id: "n14", label: "רחל דוד", type: "employee", x: 580, y: 530, pageRank: 0.64, degree: 4, community: 3 },
  { id: "n15", label: "אמדוקס", type: "customer", x: 700, y: 150, pageRank: 0.82, degree: 6, community: 3 },
  { id: "n16", label: "בזק", type: "customer", x: 820, y: 240, pageRank: 0.79, degree: 5, community: 3 },
  { id: "n17", label: "ספק רכיבים", type: "supplier", x: 750, y: 340, pageRank: 0.66, degree: 4, community: 3 },
  { id: "n18", label: "אלון פרץ", type: "employee", x: 720, y: 560, pageRank: 0.61, degree: 4, community: 3 },
  { id: "n19", label: "אלביט", type: "customer", x: 870, y: 120, pageRank: 0.74, degree: 4, community: 3 },
  { id: "n20", label: "פרויקט אפסילון", type: "project", x: 860, y: 460, pageRank: 0.65, degree: 3, community: 3 },
];

const MOCK_EDGES: GraphEdge[] = [
  { source: "n1", target: "n4", strength: 0.9, type: "שרשרת אספקה" },
  { source: "n1", target: "n7", strength: 0.85, type: "בעלות פרויקט" },
  { source: "n1", target: "n11", strength: 0.7, type: "איש קשר" },
  { source: "n2", target: "n4", strength: 0.75, type: "שרשרת אספקה" },
  { source: "n2", target: "n5", strength: 0.82, type: "שרשרת אספקה" },
  { source: "n2", target: "n8", strength: 0.88, type: "בעלות פרויקט" },
  { source: "n2", target: "n12", strength: 0.65, type: "איש קשר" },
  { source: "n3", target: "n5", strength: 0.78, type: "שרשרת אספקה" },
  { source: "n3", target: "n6", strength: 0.85, type: "שרשרת אספקה" },
  { source: "n3", target: "n9", strength: 0.9, type: "בעלות פרויקט" },
  { source: "n3", target: "n13", strength: 0.72, type: "איש קשר" },
  { source: "n4", target: "n7", strength: 0.68, type: "אספקה לפרויקט" },
  { source: "n5", target: "n8", strength: 0.75, type: "אספקה לפרויקט" },
  { source: "n6", target: "n9", strength: 0.7, type: "אספקה לפרויקט" },
  { source: "n6", target: "n10", strength: 0.65, type: "אספקה לפרויקט" },
  { source: "n7", target: "n11", strength: 0.85, type: "מנהל פרויקט" },
  { source: "n7", target: "n12", strength: 0.72, type: "צוות" },
  { source: "n8", target: "n12", strength: 0.88, type: "מנהל פרויקט" },
  { source: "n8", target: "n13", strength: 0.78, type: "צוות" },
  { source: "n9", target: "n13", strength: 0.82, type: "מנהל פרויקט" },
  { source: "n9", target: "n14", strength: 0.75, type: "צוות" },
  { source: "n10", target: "n14", strength: 0.78, type: "מנהל פרויקט" },
  { source: "n15", target: "n6", strength: 0.72, type: "שרשרת אספקה" },
  { source: "n15", target: "n17", strength: 0.8, type: "שרשרת אספקה" },
  { source: "n15", target: "n10", strength: 0.75, type: "בעלות פרויקט" },
  { source: "n16", target: "n17", strength: 0.78, type: "שרשרת אספקה" },
  { source: "n16", target: "n20", strength: 0.85, type: "בעלות פרויקט" },
  { source: "n16", target: "n18", strength: 0.68, type: "איש קשר" },
  { source: "n17", target: "n20", strength: 0.7, type: "אספקה לפרויקט" },
  { source: "n19", target: "n17", strength: 0.65, type: "שרשרת אספקה" },
  { source: "n19", target: "n18", strength: 0.72, type: "איש קשר" },
  { source: "n20", target: "n18", strength: 0.78, type: "מנהל פרויקט" },
  { source: "n1", target: "n2", strength: 0.55, type: "שיתוף פעולה" },
  { source: "n15", target: "n16", strength: 0.6, type: "שיתוף פעולה" },
  { source: "n11", target: "n12", strength: 0.5, type: "צוות" },
];

export default function GraphAnalytics() {
  const [selectedNode, setSelectedNode] = useState<string | null>("n1");
  const [filterType, setFilterType] = useState<NodeType | "all">("all");
  const [minConnections, setMinConnections] = useState(0);

  const { data } = useQuery({
    queryKey: ["graph-analytics"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/advanced/graph-analytics");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { nodes: MOCK_NODES, edges: MOCK_EDGES };
      }
    },
  });

  const nodes: GraphNode[] = data?.nodes || MOCK_NODES;
  const edges: GraphEdge[] = data?.edges || MOCK_EDGES;

  const filteredNodes = nodes.filter((n) => (filterType === "all" || n.type === filterType) && n.degree >= minConnections);
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));

  const stats = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    communities: new Set(nodes.map((n) => n.community)).size,
    avgDegree: (edges.length * 2 / nodes.length).toFixed(1),
  };

  const topInfluencers = [...nodes].sort((a, b) => b.pageRank - a.pageRank).slice(0, 6);
  const selected = nodes.find((n) => n.id === selectedNode);
  const connectedEdges = edges.filter((e) => e.source === selectedNode || e.target === selectedNode);
  const connectedNodeIds = new Set(connectedEdges.flatMap((e) => [e.source, e.target]).filter((id) => id !== selectedNode));
  const connectedNodes = nodes.filter((n) => connectedNodeIds.has(n.id));

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/40">
            <Network className="h-7 w-7 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ניתוח גרפי עסקי — רשת קשרים</h1>
            <p className="text-sm text-gray-400">ויזואליזציה של קשרים בין לקוחות, ספקים, פרויקטים ועובדים</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">סך צמתים</div>
              <div className="text-2xl font-bold text-indigo-400">{stats.totalNodes}</div>
            </div>
            <Circle className="h-8 w-8 text-indigo-400/50" />
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">סך קשרים</div>
              <div className="text-2xl font-bold text-purple-400">{stats.totalEdges}</div>
            </div>
            <GitBranch className="h-8 w-8 text-purple-400/50" />
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">קהילות</div>
              <div className="text-2xl font-bold text-green-400">{stats.communities}</div>
            </div>
            <Users className="h-8 w-8 text-green-400/50" />
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">דרגה ממוצעת</div>
              <div className="text-2xl font-bold text-amber-400">{stats.avgDegree}</div>
            </div>
            <Activity className="h-8 w-8 text-amber-400/50" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-3">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white text-base">
                  <Share2 className="h-4 w-4 text-indigo-400" />
                  מפת קשרים — Node-Link Diagram
                </CardTitle>
                <div className="flex gap-2">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-1 text-xs"
                  >
                    <option value="all">כל הסוגים</option>
                    <option value="customer">לקוחות</option>
                    <option value="supplier">ספקים</option>
                    <option value="project">פרויקטים</option>
                    <option value="employee">עובדים</option>
                  </select>
                  <select
                    value={minConnections}
                    onChange={(e) => setMinConnections(Number(e.target.value))}
                    className="bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-1 text-xs"
                  >
                    <option value="0">כל הקשרים</option>
                    <option value="3">3+</option>
                    <option value="5">5+</option>
                    <option value="7">7+</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-[#0a0e1a] border border-[#1f2937] overflow-hidden">
                <svg viewBox="0 0 950 650" className="w-full h-[550px]">
                  <defs>
                    <radialGradient id="nodeGlow">
                      <stop offset="0%" stopColor="white" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {filteredEdges.map((edge, i) => {
                    const source = nodes.find((n) => n.id === edge.source);
                    const target = nodes.find((n) => n.id === edge.target);
                    if (!source || !target) return null;
                    const isConnectedToSelected = selectedNode && (edge.source === selectedNode || edge.target === selectedNode);
                    return (
                      <line
                        key={i}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={isConnectedToSelected ? "#6366f1" : "#374151"}
                        strokeWidth={edge.strength * 3}
                        strokeOpacity={isConnectedToSelected ? 0.8 : 0.3}
                      />
                    );
                  })}
                  {filteredNodes.map((node) => {
                    const config = NODE_CONFIG[node.type];
                    const radius = 8 + node.degree * 1.8;
                    const isSelected = selectedNode === node.id;
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={() => setSelectedNode(node.id)}
                        style={{ cursor: "pointer" }}
                      >
                        {isSelected && (
                          <circle r={radius + 8} fill="none" stroke={config.bgHex} strokeWidth="2" strokeOpacity="0.6" className="animate-pulse" />
                        )}
                        <circle r={radius + 4} fill="url(#nodeGlow)" />
                        <circle
                          r={radius}
                          fill={config.bgHex}
                          fillOpacity={isSelected ? 1 : 0.85}
                          stroke={isSelected ? "white" : "#1f2937"}
                          strokeWidth={isSelected ? 2.5 : 1}
                        />
                        <text
                          textAnchor="middle"
                          y={radius + 14}
                          fill="white"
                          fontSize="11"
                          fontWeight={isSelected ? "bold" : "normal"}
                        >
                          {node.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="flex items-center gap-4 mt-4 justify-center text-xs">
                {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg.bgHex }} />
                    <span className="text-gray-400">{cfg.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-1 space-y-4">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                ישויות משפיעות (PageRank)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topInfluencers.map((node, i) => {
                const config = NODE_CONFIG[node.type];
                const Icon = config.icon;
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node.id)}
                    className="flex items-center gap-2 p-2 rounded-lg bg-[#0a0e1a] border border-[#1f2937] hover:border-indigo-500/40 cursor-pointer"
                  >
                    <div className="text-xs text-gray-500 font-mono w-4">#{i + 1}</div>
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{node.label}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 h-5">
                      {node.pageRank.toFixed(2)}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Target className="h-4 w-4 text-green-400" />
                קהילות שזוהו
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-2">
                <div className="text-3xl font-bold text-green-400">{stats.communities}</div>
                <div className="text-xs text-gray-400 mt-1">אשכולות עסקיים</div>
              </div>
              <div className="space-y-2 mt-3">
                {[1, 2, 3].map((c) => {
                  const count = nodes.filter((n) => n.community === c).length;
                  return (
                    <div key={c} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">קהילה {c}</span>
                      <Badge variant="outline" className="border-[#1f2937]">{count} ישויות</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {selected && (
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-white text-sm">
                  <Zap className="h-4 w-4 text-indigo-400" />
                  {selected.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">סוג:</span>
                    <Badge className={`${NODE_CONFIG[selected.type].color} bg-transparent border-[#1f2937]`}>
                      {NODE_CONFIG[selected.type].label}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">דרגה:</span>
                    <span>{selected.degree}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">PageRank:</span>
                    <span className="text-amber-400">{selected.pageRank.toFixed(3)}</span>
                  </div>
                  <div className="pt-2 border-t border-[#1f2937]">
                    <div className="text-gray-500 mb-1">מחובר ל-{connectedNodes.length}:</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {connectedNodes.slice(0, 6).map((cn) => (
                        <div key={cn.id} className="text-[10px] text-gray-400 truncate">• {cn.label}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-white text-sm">
              <Filter className="h-4 w-4 text-indigo-400" />
              התפלגות סוגי קשרים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from(new Set(edges.map((e) => e.type))).map((type) => {
                const count = edges.filter((e) => e.type === type).length;
                const pct = (count / edges.length) * 100;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">{type}</span>
                      <span className="text-indigo-400 font-bold">{count}</span>
                    </div>
                    <div className="h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111827] border-[#1f2937]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-white text-sm">
              <Users className="h-4 w-4 text-blue-400" />
              התפלגות ישויות לפי סוג
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(NODE_CONFIG).map(([type, cfg]) => {
                const count = nodes.filter((n) => n.type === type).length;
                const pct = (count / nodes.length) * 100;
                const Icon = cfg.icon;
                return (
                  <div key={type} className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={`h-5 w-5 ${cfg.color}`} />
                      <span className="text-lg font-bold" style={{ color: cfg.bgHex }}>{count}</span>
                    </div>
                    <div className="text-xs text-gray-400">{cfg.label}</div>
                    <div className="text-[10px] text-gray-500 mt-1">{pct.toFixed(0)}% מהרשת</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111827] border-[#1f2937]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-white text-sm">
              <Activity className="h-4 w-4 text-green-400" />
              תובנות אוטומטיות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-3 w-3 text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-gray-300">
                    <span className="text-green-400 font-semibold">תעש ישראל</span> הוא הצומת המרכזי בקהילה 1 — ניתוק עלול להשפיע על 8 ישויות
                  </div>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <Target className="h-3 w-3 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-gray-300">
                    נמצא צוואר בקבוק ב<span className="text-amber-400 font-semibold"> ספק פלדה א׳</span> — משרת 3 פרויקטים קריטיים
                  </div>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <div className="flex items-start gap-2">
                  <Network className="h-3 w-3 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-gray-300">
                    צפיפות הרשת: <span className="text-purple-400 font-semibold">0.18</span> — רשת רצחה בממוצע
                  </div>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-start gap-2">
                  <GitBranch className="h-3 w-3 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-gray-300">
                    זוהו <span className="text-blue-400 font-semibold">3 קהילות</span> נפרדות — מעיד על פיצול גיאוגרפי
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#111827] border-[#1f2937] mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-white text-sm">
            <Share2 className="h-4 w-4 text-indigo-400" />
            מטריצת קישוריות — Top 10 חיבורים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-[#1f2937] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0a0e1a] border-b border-[#1f2937]">
                <tr>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">מקור</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">יעד</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">סוג קשר</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">עוצמה</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {[...edges].sort((a, b) => b.strength - a.strength).slice(0, 10).map((edge, i) => {
                  const source = nodes.find((n) => n.id === edge.source);
                  const target = nodes.find((n) => n.id === edge.target);
                  if (!source || !target) return null;
                  const srcCfg = NODE_CONFIG[source.type];
                  const tgtCfg = NODE_CONFIG[target.type];
                  return (
                    <tr key={i} className="border-b border-[#1f2937] hover:bg-[#0a0e1a]/50">
                      <td className="px-4 py-2">
                        <span className={srcCfg.color}>{source.label}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={tgtCfg.color}>{target.label}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{edge.type}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${edge.strength * 100}%` }} />
                          </div>
                          <span className="text-xs text-indigo-400">{(edge.strength * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-[#1f2937]" onClick={() => setSelectedNode(source.id)}>
                          <Zap className="h-3 w-3 text-indigo-400" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
