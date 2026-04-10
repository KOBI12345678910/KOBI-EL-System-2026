import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Network, ZoomIn, ZoomOut, Maximize2, Move, Undo2, Search,
  Users, Truck, Briefcase, FileText, Package, Eye,
  Route, Layers, X, Filter, Share2, GitBranch,
  ArrowRightLeft, Info, ChevronRight, Sparkles, RefreshCw,
} from "lucide-react";

type NodeType = "customer" | "supplier" | "project" | "invoice" | "item" | "employee";

type GraphNode = {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
  risk?: number;
  properties: Record<string, string | number>;
};

type GraphEdge = {
  source: string;
  target: string;
  label: string;
  weight: number;
  kind: "financial" | "ownership" | "supply" | "work";
};

const NODE_CONFIG: Record<NodeType, { color: string; fill: string; stroke: string; icon: any; label: string }> = {
  customer: { color: "text-blue-400", fill: "#1e3a8a", stroke: "#60a5fa", icon: Users, label: "לקוח" },
  supplier: { color: "text-emerald-400", fill: "#065f46", stroke: "#34d399", icon: Truck, label: "ספק" },
  project: { color: "text-violet-400", fill: "#5b21b6", stroke: "#a78bfa", icon: Briefcase, label: "פרויקט" },
  invoice: { color: "text-amber-400", fill: "#92400e", stroke: "#fbbf24", icon: FileText, label: "חשבונית" },
  item: { color: "text-pink-400", fill: "#9d174d", stroke: "#f472b6", icon: Package, label: "פריט" },
  employee: { color: "text-cyan-400", fill: "#155e75", stroke: "#22d3ee", icon: Users, label: "עובד" },
};

// 25 nodes forming clusters with positions
const FALLBACK_NODES: GraphNode[] = [
  // Central cluster - Electra Construction & its network
  { id: "C-10021", label: "אלקטרה בנייה", type: "customer", x: 500, y: 350, risk: 15, properties: { "סוג": "Gold", "הכנסות": "₪12.4M", "הזמנות": 48 } },
  { id: "PRJ-2024-A", label: "מגדלי ת״א מתחם 7", type: "project", x: 320, y: 220, risk: 25, properties: { "תקציב": "₪4.2M", "התקדמות": "64%" } },
  { id: "PRJ-2024-B", label: "בית מלון רמת-גן", type: "project", x: 680, y: 220, risk: 30, properties: { "תקציב": "₪8.7M", "התקדמות": "47%" } },
  { id: "INV-7821", label: "INV-7821", type: "invoice", x: 200, y: 360, risk: 35, properties: { "סכום": "₪325K", "ימי פתיחה": 30 } },
  { id: "INV-7834", label: "INV-7834", type: "invoice", x: 800, y: 360, risk: 18, properties: { "סכום": "₪780K" } },
  { id: "EMP-4421", label: "יוסי אברהם", type: "employee", x: 500, y: 560, risk: 10, properties: { "תפקיד": "מנהל פרויקט", "צוות": 12 } },
  { id: "EMP-4478", label: "דני כהן", type: "employee", x: 350, y: 480, risk: 5, properties: { "תפקיד": "מנהל תיק" } },

  // Supplier cluster
  { id: "S-2011", label: "אל-יוניון פלדות", type: "supplier", x: 120, y: 140, risk: 8, properties: { "דירוג": "4.8/5", "עמידה בלו״ז": "96%" } },
  { id: "S-2034", label: "קלאפ ברזל", type: "supplier", x: 120, y: 260, risk: 18, properties: { "דירוג": "4.5/5" } },
  { id: "S-2067", label: "ט.מ.ל טכנולוגיות", type: "supplier", x: 120, y: 380, risk: 5, properties: { "דירוג": "4.9/5" } },
  { id: "S-2178", label: "אלומיניום הנגב", type: "supplier", x: 120, y: 500, risk: 12, properties: { "דירוג": "4.6/5" } },

  // Items cluster
  { id: "ITM-4521", label: "פרופיל אל׳ 6063", type: "item", x: 260, y: 60, risk: 20, properties: { "מלאי": 2340, "עלות": "₪48" } },
  { id: "ITM-8812", label: "בורג פילוט", type: "item", x: 420, y: 60, risk: 8, properties: { "מלאי": 45000 } },
  { id: "ITM-1023", label: "זכוכית בידודית", type: "item", x: 580, y: 60, risk: 25, properties: { "מלאי": 180 } },
  { id: "ITM-2245", label: "קצף PU", type: "item", x: 740, y: 60, risk: 85, properties: { "מלאי": 25, "סטטוס": "חוסר" } },

  // Second customer cluster
  { id: "C-10045", label: "שיכון ובינוי", type: "customer", x: 880, y: 480, risk: 12, properties: { "סוג": "Gold", "הכנסות": "₪28.7M" } },
  { id: "PRJ-2023-C", label: "מתחם פ״ת", type: "project", x: 1000, y: 340, risk: 8, properties: { "תקציב": "₪12.5M", "התקדמות": "100%" } },
  { id: "INV-7856", label: "INV-7856", type: "invoice", x: 1080, y: 520, risk: 92, properties: { "סכום": "₪142K", "איחור": "47 ימים" } },

  // Third customer
  { id: "C-10234", label: "טבע תעשיות", type: "customer", x: 300, y: 680, risk: 8, properties: { "סוג": "Gold", "הכנסות": "₪45.3M" } },
  { id: "PRJ-2024-E", label: "מרכז מחקר טבע", type: "project", x: 480, y: 760, risk: 15, properties: { "תקציב": "₪15.8M" } },
  { id: "INV-7891", label: "INV-7891", type: "invoice", x: 180, y: 760, risk: 10, properties: { "סכום": "₪1.24M" } },

  // Fourth customer
  { id: "C-10456", label: "בנק הפועלים", type: "customer", x: 760, y: 700, risk: 5, properties: { "סוג": "Gold", "הכנסות": "₪68.2M" } },
  { id: "PRJ-2024-D", label: "שיפוץ בנק הפועלים", type: "project", x: 920, y: 700, risk: 22, properties: { "תקציב": "₪2.8M" } },
  { id: "EMP-4501", label: "רונית לוי", type: "employee", x: 650, y: 780, risk: 8, properties: { "תפקיד": "מנהלת תיק" } },
  { id: "PO-4534", label: "PO-4534", type: "invoice", x: 50, y: 620, risk: 15, properties: { "סכום": "₪89.4K" } },
];

const FALLBACK_EDGES: GraphEdge[] = [
  // Electra cluster edges
  { source: "C-10021", target: "PRJ-2024-A", label: "בעלים", weight: 3, kind: "ownership" },
  { source: "C-10021", target: "PRJ-2024-B", label: "בעלים", weight: 3, kind: "ownership" },
  { source: "C-10021", target: "INV-7821", label: "חייב ל", weight: 2, kind: "financial" },
  { source: "C-10021", target: "INV-7834", label: "חייב ל", weight: 3, kind: "financial" },
  { source: "PRJ-2024-A", target: "EMP-4421", label: "מנוהל ע״י", weight: 2, kind: "work" },
  { source: "PRJ-2024-B", target: "EMP-4421", label: "מנוהל ע״י", weight: 2, kind: "work" },
  { source: "C-10021", target: "EMP-4478", label: "מנוהל ע״י", weight: 1, kind: "work" },

  // Suppliers to items
  { source: "S-2011", target: "ITM-4521", label: "מספק", weight: 3, kind: "supply" },
  { source: "S-2011", target: "ITM-8812", label: "מספק", weight: 2, kind: "supply" },
  { source: "S-2034", target: "ITM-4521", label: "מספק", weight: 2, kind: "supply" },
  { source: "S-2178", target: "ITM-4521", label: "מספק", weight: 3, kind: "supply" },
  { source: "S-2067", target: "ITM-1023", label: "מספק", weight: 2, kind: "supply" },
  { source: "S-2067", target: "ITM-2245", label: "מספק", weight: 1, kind: "supply" },

  // Items used in projects
  { source: "PRJ-2024-A", target: "ITM-4521", label: "משתמש", weight: 3, kind: "supply" },
  { source: "PRJ-2024-A", target: "ITM-8812", label: "משתמש", weight: 2, kind: "supply" },
  { source: "PRJ-2024-B", target: "ITM-1023", label: "משתמש", weight: 2, kind: "supply" },
  { source: "PRJ-2024-B", target: "ITM-4521", label: "משתמש", weight: 2, kind: "supply" },
  { source: "PRJ-2024-A", target: "ITM-2245", label: "משתמש", weight: 1, kind: "supply" },

  // Shikun cluster
  { source: "C-10045", target: "PRJ-2023-C", label: "בעלים", weight: 3, kind: "ownership" },
  { source: "C-10045", target: "INV-7856", label: "חייב ל", weight: 3, kind: "financial" },
  { source: "PRJ-2023-C", target: "C-10045", label: "הושלם עבור", weight: 2, kind: "ownership" },

  // Teva cluster
  { source: "C-10234", target: "PRJ-2024-E", label: "בעלים", weight: 3, kind: "ownership" },
  { source: "C-10234", target: "INV-7891", label: "חייב ל", weight: 3, kind: "financial" },
  { source: "PRJ-2024-E", target: "ITM-1023", label: "משתמש", weight: 2, kind: "supply" },

  // Bank cluster
  { source: "C-10456", target: "PRJ-2024-D", label: "בעלים", weight: 2, kind: "ownership" },
  { source: "C-10456", target: "EMP-4501", label: "מנוהל ע״י", weight: 1, kind: "work" },
  { source: "PRJ-2024-D", target: "EMP-4501", label: "מטופל ע״י", weight: 2, kind: "work" },

  // Cross-cluster
  { source: "EMP-4421", target: "EMP-4478", label: "מדווח ל", weight: 1, kind: "work" },
  { source: "S-2067", target: "PRJ-2024-E", label: "מספק", weight: 2, kind: "supply" },
  { source: "PO-4534", target: "S-2067", label: "הזמנה מ", weight: 1, kind: "financial" },
  { source: "PO-4534", target: "C-10021", label: "עבור", weight: 1, kind: "financial" },
  { source: "PRJ-2024-B", target: "S-2011", label: "רכש מ", weight: 2, kind: "supply" },
  { source: "PRJ-2023-C", target: "S-2034", label: "רכש מ", weight: 1, kind: "supply" },
  { source: "C-10021", target: "S-2011", label: "שותף עם", weight: 1, kind: "supply" },
  { source: "EMP-4501", target: "EMP-4478", label: "עמית", weight: 1, kind: "work" },
  { source: "PRJ-2024-E", target: "EMP-4421", label: "מעורב", weight: 1, kind: "work" },
  { source: "ITM-2245", target: "PRJ-2024-B", label: "משתמש", weight: 1, kind: "supply" },
  { source: "S-2178", target: "PRJ-2024-A", label: "מספק", weight: 2, kind: "supply" },
  { source: "C-10234", target: "S-2067", label: "רכש ישיר", weight: 1, kind: "supply" },
  { source: "INV-7856", target: "PRJ-2023-C", label: "בגין", weight: 2, kind: "financial" },
  { source: "INV-7891", target: "PRJ-2024-E", label: "בגין", weight: 2, kind: "financial" },
];

const EDGE_COLOR: Record<string, string> = {
  financial: "#fbbf24",
  ownership: "#60a5fa",
  supply: "#34d399",
  work: "#a78bfa",
};

export default function LinkAnalysisGraph() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>("C-10021");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<NodeType>>(new Set());
  const [search, setSearch] = useState("");
  const [pathMode, setPathMode] = useState(false);
  const [pathStart, setPathStart] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["palantir-graph"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/graph");
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return { nodes: FALLBACK_NODES, edges: FALLBACK_EDGES };
      }
    },
  });

  const nodes: GraphNode[] = data?.nodes || FALLBACK_NODES;
  const edges: GraphEdge[] = data?.edges || FALLBACK_EDGES;

  const visibleNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (filterTypes.size > 0 && !filterTypes.has(n.type)) return false;
      if (search && !n.label.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [nodes, filterTypes, search]);

  const visibleEdges = useMemo(() => {
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  }, [visibleNodes, edges]);

  const selectedNodeObj = nodes.find((n) => n.id === selectedNode);
  const connectedEdges = edges.filter((e) => e.source === selectedNode || e.target === selectedNode);
  const connectedNodeIds = new Set([
    ...connectedEdges.map((e) => e.source),
    ...connectedEdges.map((e) => e.target),
  ]);

  const isHighlighted = (id: string) => {
    if (!selectedNode && !hoveredNode) return false;
    const target = hoveredNode || selectedNode;
    if (id === target) return true;
    return edges.some(
      (e) => (e.source === target && e.target === id) || (e.target === target && e.source === id)
    );
  };

  const toggleType = (t: NodeType) => {
    const n = new Set(filterTypes);
    n.has(t) ? n.delete(t) : n.add(t);
    setFilterTypes(n);
  };

  const riskColor = (r: number) => {
    if (r >= 70) return "#ef4444";
    if (r >= 40) return "#fbbf24";
    return "#34d399";
  };

  return (
    <div dir="rtl" className="h-screen bg-[#0a0e1a] text-slate-200 flex flex-col">
      {/* TOP BAR */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20 border border-cyan-500/30">
              <Network className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Link Analysis — ניתוח קשרים</h1>
              <p className="text-xs text-slate-400">גרף אינטראקטיבי של קשרים בין ישויות · {nodes.length} ישויות · {edges.length} קשרים</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 border-slate-700 bg-slate-900/50">
              <Share2 className="ml-1.5 h-4 w-4" />
              שיתוף
            </Button>
            <Button size="sm" className="h-9 bg-cyan-600 hover:bg-cyan-700">
              <Sparkles className="ml-1.5 h-4 w-4" />
              ניתוח AI
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL */}
        <aside className="w-64 flex-shrink-0 border-l border-slate-800 bg-slate-900/30 overflow-y-auto">
          {/* Search */}
          <div className="border-b border-slate-800 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">חיפוש מהיר</p>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חפש ישות..."
                className="h-8 border-slate-700 bg-slate-900/50 pr-9 text-xs"
              />
            </div>
          </div>

          {/* Filter */}
          <div className="border-b border-slate-800 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
              <Filter className="h-3 w-3" />
              סינון לפי סוג
            </p>
            <div className="space-y-1">
              {(Object.entries(NODE_CONFIG) as [NodeType, any][]).map(([key, cfg]) => {
                const active = filterTypes.has(key);
                const count = nodes.filter((n) => n.type === key).length;
                const Icon = cfg.icon;
                return (
                  <button
                    key={key}
                    onClick={() => toggleType(key)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-all ${
                      active ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className={`h-3 w-3 ${cfg.color}`} />
                    {cfg.label}
                    <span className="mr-auto font-mono text-[10px] text-slate-500">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="border-b border-slate-800 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">מקרא קשרים</p>
            <div className="space-y-1.5 text-xs">
              {Object.entries(EDGE_COLOR).map(([kind, color]) => (
                <div key={kind} className="flex items-center gap-2">
                  <div className="h-0.5 w-6" style={{ background: color }}></div>
                  <span className="text-slate-400">
                    {kind === "financial" ? "פיננסי" : kind === "ownership" ? "בעלות" : kind === "supply" ? "אספקה" : "עבודה"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Node List */}
          <div className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">ישויות ({visibleNodes.length})</p>
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {visibleNodes.map((n) => {
                const cfg = NODE_CONFIG[n.type];
                const Icon = cfg.icon;
                const active = selectedNode === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => setSelectedNode(n.id)}
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-all ${
                      active ? "bg-cyan-500/15 text-white" : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className={`h-3 w-3 ${cfg.color}`} />
                    <span className="truncate flex-1 text-right">{n.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* MAIN - Graph Canvas */}
        <main className="flex-1 relative bg-[#060916] overflow-hidden">
          {/* Toolbar */}
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/80 backdrop-blur p-1.5">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-800" onClick={() => setZoom(Math.min(2, zoom + 0.2))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-800" onClick={() => setZoom(Math.max(0.3, zoom - 0.2))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-800" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-800">
              <Move className="h-4 w-4" />
            </Button>
            <div className="h-px bg-slate-700 my-0.5"></div>
            <Button
              size="sm"
              variant="ghost"
              className={`h-8 w-8 p-0 ${pathMode ? "bg-cyan-500/20 text-cyan-400" : "hover:bg-slate-800"}`}
              onClick={() => setPathMode(!pathMode)}
              title="מציאת מסלול"
            >
              <Route className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-800" title="הרחב ישות">
              <GitBranch className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-800">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-800">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Zoom Indicator */}
          <div className="absolute top-4 left-4 z-10 rounded-md border border-slate-800 bg-slate-900/80 backdrop-blur px-3 py-1.5 text-xs text-slate-400">
            זום: <span className="font-mono text-cyan-400">{Math.round(zoom * 100)}%</span>
          </div>

          {/* SVG Canvas */}
          <svg
            viewBox="0 0 1200 850"
            className="w-full h-full"
            style={{ background: "radial-gradient(ellipse at center, #0c1428 0%, #060916 100%)" }}
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
              </pattern>
              {Object.entries(EDGE_COLOR).map(([kind, color]) => (
                <marker
                  key={kind}
                  id={`arrow-${kind}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                </marker>
              ))}
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {visibleEdges.map((e, i) => {
                const src = nodes.find((n) => n.id === e.source);
                const tgt = nodes.find((n) => n.id === e.target);
                if (!src || !tgt) return null;
                const highlight =
                  selectedNode === e.source || selectedNode === e.target ||
                  hoveredNode === e.source || hoveredNode === e.target;
                const color = EDGE_COLOR[e.kind];
                const mx = (src.x + tgt.x) / 2;
                const my = (src.y + tgt.y) / 2;
                return (
                  <g key={i} opacity={highlight ? 1 : selectedNode || hoveredNode ? 0.15 : 0.6}>
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={color}
                      strokeWidth={1 + e.weight * 0.5}
                      markerEnd={`url(#arrow-${e.kind})`}
                      className="transition-all duration-200"
                    />
                    {highlight && (
                      <g>
                        <rect x={mx - 30} y={my - 8} width="60" height="16" rx="3" fill="#0a0e1a" stroke={color} strokeWidth="0.5" />
                        <text x={mx} y={my + 3} fontSize="8" fill={color} textAnchor="middle">{e.label}</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {visibleNodes.map((n) => {
                const cfg = NODE_CONFIG[n.type];
                const highlight = isHighlighted(n.id);
                const active = selectedNode === n.id;
                const hovered = hoveredNode === n.id;
                const r = active ? 28 : hovered ? 26 : 22;
                const rc = riskColor(n.risk || 0);

                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x} ${n.y})`}
                    className="cursor-pointer"
                    opacity={selectedNode && !highlight && !hovered ? 0.3 : 1}
                    onClick={() => setSelectedNode(n.id)}
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {/* outer ring for risk */}
                    {n.risk != null && n.risk > 30 && (
                      <circle r={r + 4} fill="none" stroke={rc} strokeWidth="2" strokeDasharray="3,2" opacity="0.6">
                        <animate attributeName="r" values={`${r + 4};${r + 7};${r + 4}`} dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {/* glow when active */}
                    {(active || hovered) && (
                      <circle r={r + 6} fill={cfg.stroke} opacity="0.15" />
                    )}
                    <circle
                      r={r}
                      fill={cfg.fill}
                      stroke={active ? "#fff" : cfg.stroke}
                      strokeWidth={active ? 2.5 : 1.5}
                      filter={active ? "url(#glow)" : undefined}
                      className="transition-all duration-200"
                    />
                    {/* Icon placeholder - using initial letter */}
                    <text
                      y="4"
                      fontSize="14"
                      fill={cfg.stroke}
                      textAnchor="middle"
                      fontWeight="700"
                    >
                      {cfg.label.charAt(0)}
                    </text>
                    {/* Label */}
                    <rect
                      x={-45}
                      y={r + 6}
                      width="90"
                      height="18"
                      rx="3"
                      fill="#0a0e1a"
                      stroke={active ? cfg.stroke : "transparent"}
                      strokeWidth="0.5"
                    />
                    <text
                      y={r + 18}
                      fontSize="9"
                      fill={active ? "#fff" : "#94a3b8"}
                      textAnchor="middle"
                      fontWeight={active ? 600 : 400}
                    >
                      {n.label.length > 14 ? n.label.slice(0, 13) + "…" : n.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Bottom Info Bar */}
          {selectedNodeObj && (
            <div className="absolute bottom-4 left-4 right-4 z-10 rounded-lg border border-slate-800 bg-slate-900/90 backdrop-blur px-4 py-3 flex items-center gap-4">
              {(() => {
                const cfg = NODE_CONFIG[selectedNodeObj.type];
                const Icon = cfg.icon;
                return (
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg border`} style={{ borderColor: cfg.stroke, background: cfg.fill }}>
                    <Icon className={`h-5 w-5 ${cfg.color}`} />
                  </div>
                );
              })()}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500">{selectedNodeObj.id}</span>
                  <h3 className="text-sm font-bold text-white">{selectedNodeObj.label}</h3>
                  <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{NODE_CONFIG[selectedNodeObj.type].label}</Badge>
                  {selectedNodeObj.risk != null && selectedNodeObj.risk > 30 && (
                    <Badge className="text-[10px]" style={{ background: `${riskColor(selectedNodeObj.risk)}20`, color: riskColor(selectedNodeObj.risk), borderColor: `${riskColor(selectedNodeObj.risk)}40` }}>
                      סיכון {selectedNodeObj.risk}%
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-400">
                  <span>{connectedEdges.length} קשרים</span>
                  <span>{connectedNodeIds.size - 1} שכנים</span>
                  {Object.entries(selectedNodeObj.properties).slice(0, 3).map(([k, v]) => (
                    <span key={k}>{k}: <span className="text-slate-200 font-mono">{String(v)}</span></span>
                  ))}
                </div>
              </div>
              <Button size="sm" className="h-8 bg-cyan-600 hover:bg-cyan-700">
                <Eye className="ml-1.5 h-3.5 w-3.5" />
                פתח Dossier
              </Button>
            </div>
          )}
        </main>

        {/* RIGHT PANEL - Selected entity details */}
        <aside className="w-72 flex-shrink-0 border-r border-slate-800 bg-slate-900/30 overflow-y-auto">
          {selectedNodeObj ? (
            <>
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">פרטי ישות</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedNode(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const cfg = NODE_CONFIG[selectedNodeObj.type];
                    const Icon = cfg.icon;
                    return (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2" style={{ borderColor: cfg.stroke, background: cfg.fill }}>
                        <Icon className={`h-6 w-6 ${cfg.color}`} />
                      </div>
                    );
                  })()}
                  <div>
                    <div className="font-mono text-[10px] text-slate-500">{selectedNodeObj.id}</div>
                    <h3 className="text-base font-bold text-white">{selectedNodeObj.label}</h3>
                    <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px] mt-1">{NODE_CONFIG[selectedNodeObj.type].label}</Badge>
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-800 p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">מאפיינים</p>
                <div className="space-y-1.5 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                  {Object.entries(selectedNodeObj.properties).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{k}</span>
                      <span className="font-mono text-slate-200">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedNodeObj.risk != null && (
                <div className="border-b border-slate-800 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">ציון סיכון</p>
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">רמת סיכון</span>
                      <span className="font-mono text-sm font-bold" style={{ color: riskColor(selectedNodeObj.risk) }}>{selectedNodeObj.risk}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${selectedNodeObj.risk}%`, background: riskColor(selectedNodeObj.risk) }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-b border-slate-800 p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">קשרים ({connectedEdges.length})</p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {connectedEdges.map((e, i) => {
                    const otherId = e.source === selectedNode ? e.target : e.source;
                    const other = nodes.find((n) => n.id === otherId);
                    if (!other) return null;
                    const cfg = NODE_CONFIG[other.type];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedNode(other.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-800 text-right"
                      >
                        <Icon className={`h-3 w-3 ${cfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-200 truncate">{other.label}</div>
                          <div className="text-[9px] text-slate-500">{e.label}</div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-slate-600" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 space-y-2">
                <Button className="w-full bg-cyan-600 hover:bg-cyan-700 h-9">
                  <GitBranch className="ml-2 h-4 w-4" />
                  הרחב קשרים
                </Button>
                <Button variant="outline" className="w-full border-slate-700 bg-slate-900/50 h-9">
                  <Route className="ml-2 h-4 w-4" />
                  מצא מסלול אל...
                </Button>
                <Button variant="outline" className="w-full border-slate-700 bg-slate-900/50 h-9">
                  <Eye className="ml-2 h-4 w-4" />
                  פתח Dossier מלא
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Info className="h-10 w-10 text-slate-700 mb-3" />
              <h3 className="text-sm font-semibold text-slate-400">בחר ישות</h3>
              <p className="text-xs text-slate-500 mt-1">לחץ על ישות בגרף להצגת פרטים</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
