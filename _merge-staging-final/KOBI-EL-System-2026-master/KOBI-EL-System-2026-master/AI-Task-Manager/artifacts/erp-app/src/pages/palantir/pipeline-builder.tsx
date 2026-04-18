import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Workflow, Play, Save, Plus, Clock, History, Database,
  Filter, Shuffle, Merge, Brain, GitBranch, CheckCircle2,
  AlertTriangle, X, Target, Code, Table, Settings,
  Zap, Activity, FileText, Cpu, ArrowRight, ArrowLeft,
  TrendingUp, Calendar, Server, BarChart3
} from "lucide-react";

type StageType = "source" | "filter" | "map" | "join" | "aggregate" | "ml" | "sink";
type RunStatus = "success" | "failed" | "running" | "pending";

interface Stage {
  id: string;
  type: StageType;
  name: string;
  x: number;
  y: number;
  config: Record<string, string>;
  rowsIn: number;
  rowsOut: number;
  durationMs: number;
  status: RunStatus;
  sampleData: { col: string; values: string[] }[];
}

interface Connection {
  from: string;
  to: string;
}

interface RunHistory {
  id: string;
  date: string;
  status: RunStatus;
  duration: string;
  rowsProcessed: number;
  errors: number;
  trigger: string;
}

const STAGE_CONFIG: Record<StageType, { color: string; bgHex: string; label: string; icon: any; category: string }> = {
  source: { color: "text-blue-400", bgHex: "#3b82f6", label: "Source", icon: Database, category: "מקורות נתונים" },
  filter: { color: "text-amber-400", bgHex: "#f59e0b", label: "Filter", icon: Filter, category: "טרנספורמציות" },
  map: { color: "text-cyan-400", bgHex: "#06b6d4", label: "Map", icon: Shuffle, category: "טרנספורמציות" },
  join: { color: "text-purple-400", bgHex: "#a855f7", label: "Join", icon: Merge, category: "טרנספורמציות" },
  aggregate: { color: "text-green-400", bgHex: "#22c55e", label: "Aggregate", icon: BarChart3, category: "טרנספורמציות" },
  ml: { color: "text-pink-400", bgHex: "#ec4899", label: "ML Enrich", icon: Brain, category: "מתקדם" },
  sink: { color: "text-indigo-400", bgHex: "#6366f1", label: "Sink", icon: Server, category: "פלט" },
};

const STATUS_CONFIG: Record<RunStatus, { color: string; bgHex: string; label: string; icon: any }> = {
  success: { color: "text-green-400", bgHex: "#22c55e", label: "הצליח", icon: CheckCircle2 },
  failed: { color: "text-red-400", bgHex: "#ef4444", label: "נכשל", icon: AlertTriangle },
  running: { color: "text-cyan-400", bgHex: "#06b6d4", label: "רץ", icon: Activity },
  pending: { color: "text-gray-400", bgHex: "#6b7280", label: "ממתין", icon: Clock },
};

const MOCK_STAGES: Stage[] = [
  {
    id: "s1",
    type: "source",
    name: "Orders DB",
    x: 60,
    y: 180,
    config: { table: "orders_raw", mode: "incremental", partition: "order_date" },
    rowsIn: 0,
    rowsOut: 12450,
    durationMs: 340,
    status: "success",
    sampleData: [
      { col: "order_id", values: ["O-4521", "O-4522", "O-4523"] },
      { col: "customer_id", values: ["C-112", "C-089", "C-234"] },
      { col: "amount", values: ["15000", "45000", "8900"] },
      { col: "status", values: ["active", "completed", "active"] },
    ],
  },
  {
    id: "s2",
    type: "filter",
    name: "Filter Active",
    x: 220,
    y: 180,
    config: { condition: "status = 'active'", language: "SQL" },
    rowsIn: 12450,
    rowsOut: 8234,
    durationMs: 180,
    status: "success",
    sampleData: [
      { col: "order_id", values: ["O-4521", "O-4523", "O-4525"] },
      { col: "status", values: ["active", "active", "active"] },
    ],
  },
  {
    id: "s3",
    type: "join",
    name: "Join Customers",
    x: 380,
    y: 180,
    config: { leftKey: "customer_id", rightTable: "customers_dim", joinType: "INNER" },
    rowsIn: 8234,
    rowsOut: 8102,
    durationMs: 520,
    status: "success",
    sampleData: [
      { col: "order_id", values: ["O-4521", "O-4523"] },
      { col: "customer_name", values: ["תעש ישראל", "טבע"] },
      { col: "region", values: ["מרכז", "צפון"] },
    ],
  },
  {
    id: "s4",
    type: "aggregate",
    name: "Aggregate by Region",
    x: 540,
    y: 180,
    config: { groupBy: "region", metrics: "SUM(amount), COUNT(*)" },
    rowsIn: 8102,
    rowsOut: 4,
    durationMs: 420,
    status: "success",
    sampleData: [
      { col: "region", values: ["מרכז", "צפון", "ירושלים", "דרום"] },
      { col: "total_sum", values: ["4521000", "2340000", "1120000", "890000"] },
      { col: "order_count", values: ["4521", "2134", "891", "556"] },
    ],
  },
  {
    id: "s5",
    type: "filter",
    name: "Filter Revenue > 1K",
    x: 540,
    y: 320,
    config: { condition: "total_sum > 1000000", language: "SQL" },
    rowsIn: 4,
    rowsOut: 3,
    durationMs: 45,
    status: "success",
    sampleData: [
      { col: "region", values: ["מרכז", "צפון", "ירושלים"] },
      { col: "total_sum", values: ["4521000", "2340000", "1120000"] },
    ],
  },
  {
    id: "s6",
    type: "ml",
    name: "ML Revenue Forecast",
    x: 380,
    y: 320,
    config: { model: "xgboost_sales_v3", features: "region, seasonality, trend" },
    rowsIn: 3,
    rowsOut: 3,
    durationMs: 1850,
    status: "success",
    sampleData: [
      { col: "region", values: ["מרכז", "צפון", "ירושלים"] },
      { col: "forecast_q2", values: ["5200000", "2500000", "1280000"] },
      { col: "confidence", values: ["0.92", "0.88", "0.85"] },
    ],
  },
  {
    id: "s7",
    type: "map",
    name: "Format Output",
    x: 220,
    y: 320,
    config: { expression: "TO_JSON(region, total_sum, forecast_q2)", language: "SQL" },
    rowsIn: 3,
    rowsOut: 3,
    durationMs: 85,
    status: "success",
    sampleData: [
      { col: "region", values: ["מרכז", "צפון", "ירושלים"] },
      { col: "output_json", values: ["{...}", "{...}", "{...}"] },
    ],
  },
  {
    id: "s8",
    type: "sink",
    name: "Sink: sales_daily",
    x: 60,
    y: 320,
    config: { target: "sales_daily", mode: "append", partition: "date" },
    rowsIn: 3,
    rowsOut: 3,
    durationMs: 220,
    status: "success",
    sampleData: [],
  },
];

const MOCK_CONNECTIONS: Connection[] = [
  { from: "s1", to: "s2" },
  { from: "s2", to: "s3" },
  { from: "s3", to: "s4" },
  { from: "s4", to: "s5" },
  { from: "s5", to: "s6" },
  { from: "s6", to: "s7" },
  { from: "s7", to: "s8" },
];

const MOCK_RUN_HISTORY: RunHistory[] = [
  { id: "r1", date: "2026-04-10T09:00", status: "success", duration: "3.66s", rowsProcessed: 12450, errors: 0, trigger: "Scheduled" },
  { id: "r2", date: "2026-04-09T09:00", status: "success", duration: "3.42s", rowsProcessed: 11890, errors: 0, trigger: "Scheduled" },
  { id: "r3", date: "2026-04-08T09:00", status: "success", duration: "3.58s", rowsProcessed: 12200, errors: 0, trigger: "Scheduled" },
  { id: "r4", date: "2026-04-08T14:23", status: "success", duration: "3.71s", rowsProcessed: 12210, errors: 0, trigger: "Manual" },
  { id: "r5", date: "2026-04-07T09:00", status: "failed", duration: "1.12s", rowsProcessed: 0, errors: 1, trigger: "Scheduled" },
  { id: "r6", date: "2026-04-07T10:15", status: "success", duration: "3.80s", rowsProcessed: 11560, errors: 0, trigger: "Manual retry" },
  { id: "r7", date: "2026-04-06T09:00", status: "success", duration: "3.45s", rowsProcessed: 11320, errors: 0, trigger: "Scheduled" },
  { id: "r8", date: "2026-04-05T09:00", status: "success", duration: "3.49s", rowsProcessed: 10980, errors: 0, trigger: "Scheduled" },
  { id: "r9", date: "2026-04-04T09:00", status: "success", duration: "3.52s", rowsProcessed: 11200, errors: 0, trigger: "Scheduled" },
  { id: "r10", date: "2026-04-03T09:00", status: "success", duration: "3.61s", rowsProcessed: 11430, errors: 0, trigger: "Scheduled" },
];

export default function PipelineBuilder() {
  const [selectedStageId, setSelectedStageId] = useState<string>("s4");
  const [pipelineName] = useState("Daily Sales ETL");
  const [isRunning, setIsRunning] = useState(false);

  const { data } = useQuery({
    queryKey: ["pipeline-builder"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/pipeline-builder");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { stages: MOCK_STAGES, connections: MOCK_CONNECTIONS, runHistory: MOCK_RUN_HISTORY };
      }
    },
  });

  const stages: Stage[] = data?.stages || MOCK_STAGES;
  const connections: Connection[] = data?.connections || MOCK_CONNECTIONS;
  const runHistory: RunHistory[] = data?.runHistory || MOCK_RUN_HISTORY;

  const selected = stages.find((s) => s.id === selectedStageId);

  const totalRowsProcessed = stages.reduce((sum, s) => sum + s.rowsOut, 0);
  const totalDuration = stages.reduce((sum, s) => sum + s.durationMs, 0);
  const successfulRuns = runHistory.filter((r) => r.status === "success").length;
  const successRate = ((successfulRuns / runHistory.length) * 100).toFixed(1);

  const stagesByCategory = {
    "מקורות נתונים": [STAGE_CONFIG.source],
    "טרנספורמציות": [STAGE_CONFIG.filter, STAGE_CONFIG.map, STAGE_CONFIG.join, STAGE_CONFIG.aggregate],
    "מתקדם": [STAGE_CONFIG.ml],
    "פלט": [STAGE_CONFIG.sink],
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/40">
            <Workflow className="h-7 w-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Pipeline Builder — בונה פייפליין נתונים</h1>
            <p className="text-sm text-gray-400">בונה ויזואלי לפייפליינים של נתונים — ETL, טרנספורמציות וזרימות ML</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-blue-500/40 text-blue-400">{pipelineName}</Badge>
          <Badge variant="outline" className="border-green-500/40 text-green-400">v2.3.1</Badge>
        </div>
      </div>

      {/* Top toolbar */}
      <Card className="bg-[#111827] border-[#1f2937] mb-4">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-blue-500/10">
                <Plus className="h-3.5 w-3.5 ml-1 text-blue-400" /> חדש
              </Button>
              <div className="w-px h-5 bg-[#1f2937]" />
              <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-green-500/10">
                <Save className="h-3.5 w-3.5 ml-1 text-green-400" /> שמור
              </Button>
              <Button
                size="sm"
                onClick={() => setIsRunning(!isRunning)}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
              >
                {isRunning ? <Activity className="h-3.5 w-3.5 ml-1 animate-spin" /> : <Play className="h-3.5 w-3.5 ml-1" />}
                {isRunning ? "רץ..." : "הרץ"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-amber-500/10">
                <Calendar className="h-3.5 w-3.5 ml-1 text-amber-400" /> תזמן
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-purple-500/10">
                <History className="h-3.5 w-3.5 ml-1 text-purple-400" /> היסטוריה
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>זמן אחרון: {(totalDuration / 1000).toFixed(2)}s</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{totalRowsProcessed.toLocaleString()} שורות</span>
              </div>
              <div className="flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                <span>הצלחה: {successRate}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        {/* LEFT: Stage library */}
        <div className="col-span-2">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Workflow className="h-4 w-4 text-blue-400" />
                ספריית שלבים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(stagesByCategory).map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-[10px] text-gray-500 mb-1.5 font-semibold uppercase">{cat}</div>
                  <div className="space-y-1.5">
                    {items.map((cfg) => {
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={cfg.label}
                          className="flex items-center gap-2 p-2 rounded-lg bg-[#0a0e1a] border border-[#1f2937] hover:border-blue-500/40 cursor-grab transition-colors"
                          draggable
                        >
                          <div className="p-1 rounded" style={{ backgroundColor: cfg.bgHex + "20" }}>
                            <Icon className={`h-3 w-3 ${cfg.color}`} />
                          </div>
                          <span className="text-[11px] font-medium">{cfg.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="pt-3 border-t border-[#1f2937]">
                <div className="p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Cpu className="h-3 w-3 text-indigo-400" />
                    <span className="text-[10px] font-semibold text-indigo-400">Spark Runtime</span>
                  </div>
                  <div className="text-[9px] text-gray-500">v3.5.0 • 8 cores • 32GB</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CENTER: Canvas */}
        <div className="col-span-7 space-y-4">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white text-sm">
                  <GitBranch className="h-4 w-4 text-blue-400" />
                  {pipelineName} — {stages.length} שלבים
                </CardTitle>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>Data Lineage</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-[#0a0e1a] border border-[#1f2937] overflow-hidden relative">
                <svg viewBox="0 0 700 460" className="w-full" style={{ height: "460px" }}>
                  <defs>
                    <pattern id="canvasGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1f2937" strokeWidth="0.5" />
                    </pattern>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                    </marker>
                  </defs>
                  <rect width="700" height="460" fill="url(#canvasGrid)" />

                  {/* Connections */}
                  {connections.map((conn, i) => {
                    const from = stages.find((s) => s.id === conn.from);
                    const to = stages.find((s) => s.id === conn.to);
                    if (!from || !to) return null;
                    const fx = from.x + 60;
                    const fy = from.y + 30;
                    const tx = to.x + 60;
                    const ty = to.y + 30;
                    const mx = (fx + tx) / 2;
                    return (
                      <g key={i}>
                        <path
                          d={`M ${fx} ${fy} Q ${mx} ${fy}, ${mx} ${(fy + ty) / 2} Q ${mx} ${ty}, ${tx} ${ty}`}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="1.5"
                          strokeOpacity="0.6"
                          markerEnd="url(#arrowhead)"
                        />
                        <text
                          x={(fx + tx) / 2}
                          y={(fy + ty) / 2 - 5}
                          fill="#6b7280"
                          fontSize="8"
                          textAnchor="middle"
                        >
                          {from.rowsOut.toLocaleString()}
                        </text>
                      </g>
                    );
                  })}

                  {/* Stage nodes */}
                  {stages.map((stage) => {
                    const cfg = STAGE_CONFIG[stage.type];
                    const status = STATUS_CONFIG[stage.status];
                    const isSelected = stage.id === selectedStageId;
                    return (
                      <g
                        key={stage.id}
                        transform={`translate(${stage.x}, ${stage.y})`}
                        onClick={() => setSelectedStageId(stage.id)}
                        style={{ cursor: "pointer" }}
                      >
                        {isSelected && (
                          <rect
                            x="-4"
                            y="-4"
                            width="128"
                            height="68"
                            rx="10"
                            fill="none"
                            stroke={cfg.bgHex}
                            strokeWidth="2"
                            className="animate-pulse"
                          />
                        )}
                        <rect
                          x="0"
                          y="0"
                          width="120"
                          height="60"
                          rx="8"
                          fill="#0a0e1a"
                          stroke={cfg.bgHex}
                          strokeWidth={isSelected ? 2 : 1.5}
                        />
                        <rect
                          x="0"
                          y="0"
                          width="120"
                          height="18"
                          rx="8"
                          fill={cfg.bgHex}
                          fillOpacity="0.2"
                        />
                        <circle cx="10" cy="9" r="3" fill={cfg.bgHex} />
                        <text x="20" y="12" fill={cfg.bgHex} fontSize="8" fontWeight="bold">
                          {cfg.label.toUpperCase()}
                        </text>
                        <circle cx="110" cy="9" r="3" fill={status.bgHex} />
                        <text x="60" y="35" fill="white" fontSize="10" textAnchor="middle" fontWeight="bold">
                          {stage.name}
                        </text>
                        <text x="60" y="50" fill="#9ca3af" fontSize="8" textAnchor="middle">
                          {stage.rowsOut.toLocaleString()} שורות • {stage.durationMs}ms
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Canvas legend */}
                <div className="absolute top-3 right-3 bg-[#111827] border border-[#1f2937] rounded-lg p-2">
                  <div className="text-[9px] text-gray-500 mb-1">Status</div>
                  <div className="space-y-0.5">
                    {(Object.entries(STATUS_CONFIG) as [RunStatus, typeof STATUS_CONFIG.success][]).map(([k, cfg]) => (
                      <div key={k} className="flex items-center gap-1.5 text-[9px]">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.bgHex }} />
                        <span className="text-gray-400">{cfg.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stage Sample Data */}
          {selected && selected.sampleData.length > 0 && (
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-white text-sm">
                    <Table className="h-4 w-4 text-cyan-400" />
                    תצוגה מקדימה של נתונים — {selected.name}
                  </CardTitle>
                  <Badge variant="outline" className="h-5 text-[10px] border-[#1f2937] text-cyan-400">
                    דגימה: {selected.sampleData[0]?.values.length} שורות
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-[#1f2937] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#0a0e1a] border-b border-[#1f2937]">
                      <tr>
                        {selected.sampleData.map((col) => (
                          <th key={col.col} className="text-right px-3 py-2 text-[10px] text-cyan-400 font-mono">
                            {col.col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.sampleData[0]?.values.map((_, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-[#1f2937] hover:bg-[#0a0e1a]/50">
                          {selected.sampleData.map((col) => (
                            <td key={col.col} className="px-3 py-1.5 text-gray-300 font-mono text-[11px]">
                              {col.values[rowIdx]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT: Stage configuration */}
        <div className="col-span-3">
          {selected ? (
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-white text-sm">
                    <Settings className="h-4 w-4 text-blue-400" />
                    הגדרות שלב
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedStageId("")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const StageIcon = STAGE_CONFIG[selected.type].icon;
                  return (
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded" style={{ backgroundColor: STAGE_CONFIG[selected.type].bgHex + "20" }}>
                        <StageIcon className={`h-4 w-4 ${STAGE_CONFIG[selected.type].color}`} />
                      </div>
                      <Badge variant="outline" className="h-5 text-[10px] border-[#1f2937]" style={{ color: STAGE_CONFIG[selected.type].bgHex }}>
                        {STAGE_CONFIG[selected.type].label}
                      </Badge>
                    </div>
                  );
                })()}

                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">שם השלב</label>
                  <Input value={selected.name} className="bg-[#0a0e1a] border-[#1f2937] h-8 text-xs" readOnly />
                </div>

                <div className="border-t border-[#1f2937] pt-3">
                  <div className="text-[11px] text-gray-400 mb-2">תצורה:</div>
                  <div className="space-y-2">
                    {Object.entries(selected.config).map(([key, value]) => (
                      <div key={key}>
                        <label className="text-[10px] text-gray-500 mb-0.5 block">{key}</label>
                        <Input value={value} className="bg-[#0a0e1a] border-[#1f2937] h-7 text-[11px] font-mono" readOnly />
                      </div>
                    ))}
                  </div>
                </div>

                {(selected.type === "filter" || selected.type === "map" || selected.type === "aggregate") && (
                  <div className="border-t border-[#1f2937] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] text-gray-400">SQL Expression</div>
                      <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937] text-amber-400">SQL</Badge>
                    </div>
                    <div className="rounded-md bg-[#0a0e1a] border border-[#1f2937] p-2">
                      <code className="text-[10px] text-green-400 font-mono">
                        {selected.config.condition || selected.config.expression || `GROUP BY ${selected.config.groupBy}`}
                      </code>
                    </div>
                    <Button size="sm" variant="outline" className="w-full h-7 text-[10px] border-[#1f2937] mt-2">
                      <Code className="h-3 w-3 ml-1" /> ערוך SQL
                    </Button>
                  </div>
                )}

                <div className="border-t border-[#1f2937] pt-3">
                  <div className="text-[11px] text-gray-400 mb-2">סטטיסטיקות ריצה:</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">שורות נכנסות:</span>
                      <span className="text-cyan-400 font-mono">{selected.rowsIn.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">שורות יוצאות:</span>
                      <span className="text-green-400 font-mono">{selected.rowsOut.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">יחס סינון:</span>
                      <span className="text-amber-400 font-mono">
                        {selected.rowsIn > 0 ? ((selected.rowsOut / selected.rowsIn) * 100).toFixed(1) : "100.0"}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">משך:</span>
                      <span className="text-purple-400 font-mono">{selected.durationMs}ms</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">סטטוס:</span>
                      <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937]" style={{ color: STATUS_CONFIG[selected.status].bgHex }}>
                        {STATUS_CONFIG[selected.status].label}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" className="flex-1 h-7 text-[10px] bg-blue-600 hover:bg-blue-700">
                    <Play className="h-3 w-3 ml-1" /> הרץ שלב
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-[#1f2937]">
                    <FileText className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardContent className="p-6 text-center">
                <Workflow className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                <div className="text-xs text-gray-500">בחר שלב מהקנבס כדי להציג הגדרות</div>
              </CardContent>
            </Card>
          )}

          {/* Data lineage graph */}
          <Card className="bg-[#111827] border-[#1f2937] mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <GitBranch className="h-4 w-4 text-purple-400" />
                Data Lineage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {stages.map((s, i) => {
                const cfg = STAGE_CONFIG[s.type];
                const Icon = cfg.icon;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className="text-[9px] text-gray-600 w-3 font-mono">{i + 1}</div>
                    <div className="p-1 rounded flex-shrink-0" style={{ backgroundColor: cfg.bgHex + "20" }}>
                      <Icon className={`h-2.5 w-2.5 ${cfg.color}`} />
                    </div>
                    <div className="text-[10px] truncate flex-1" style={{ color: s.id === selectedStageId ? cfg.bgHex : "#9ca3af" }}>
                      {s.name}
                    </div>
                    <div className="text-[9px] text-gray-600 font-mono">{s.rowsOut.toLocaleString()}</div>
                    {i < stages.length - 1 && <ArrowLeft className="h-2 w-2 text-gray-700" />}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* BOTTOM: Run history */}
      <Card className="bg-[#111827] border-[#1f2937] mt-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white text-sm">
              <History className="h-4 w-4 text-blue-400" />
              היסטוריית הרצות
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-5 text-[10px] border-green-500/40 text-green-400">
                {successfulRuns}/{runHistory.length} הצליחו
              </Badge>
              <Badge variant="outline" className="h-5 text-[10px] border-[#1f2937] text-gray-400">
                ממוצע: 3.5s
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-[#1f2937] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0a0e1a] border-b border-[#1f2937]">
                <tr>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">תאריך/שעה</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">סטטוס</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">משך</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">שורות</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">שגיאות</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">טריגר</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {runHistory.map((run) => {
                  const status = STATUS_CONFIG[run.status];
                  const StatusIcon = status.icon;
                  return (
                    <tr key={run.id} className="border-b border-[#1f2937] hover:bg-[#0a0e1a]/50">
                      <td className="px-4 py-2 text-xs font-mono text-gray-400">
                        {new Date(run.date).toLocaleString("he-IL", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={`h-3 w-3 ${status.color}`} />
                          <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937]" style={{ color: status.bgHex }}>
                            {status.label}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-purple-400 font-mono">{run.duration}</td>
                      <td className="px-4 py-2 text-xs text-cyan-400 font-mono">{run.rowsProcessed.toLocaleString()}</td>
                      <td className="px-4 py-2">
                        {run.errors > 0 ? (
                          <Badge variant="outline" className="h-4 text-[9px] border-red-500/40 text-red-400">{run.errors}</Badge>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400">
                        <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937] text-gray-400">
                          {run.trigger}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-[#1f2937]">
                            <FileText className="h-3 w-3 text-blue-400" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-[#1f2937]">
                            <Zap className="h-3 w-3 text-amber-400" />
                          </Button>
                        </div>
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
