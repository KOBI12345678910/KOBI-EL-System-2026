import { useState, useEffect, useRef } from "react";
import {
  Factory, Maximize2, Minimize2, AlertTriangle, CheckCircle2,
  Activity, Thermometer, Gauge, Zap, Box, Truck, Settings,
  RefreshCw, Eye, Layers, MapPin, Wifi, WifiOff, Clock,
  TrendingUp, BarChart3, Package, Wrench, Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface Machine {
  id: string;
  name: string;
  type: "cnc" | "assembly" | "packaging" | "welding" | "painting" | "testing";
  x: number;
  y: number;
  width: number;
  height: number;
  status: "running" | "idle" | "maintenance" | "error" | "offline";
  temperature?: number;
  efficiency?: number;
  output?: number;
  alerts?: string[];
}

interface Zone {
  id: string;
  name: string;
  type: "production" | "warehouse" | "shipping" | "receiving" | "office" | "maintenance";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  occupancy?: number;
  capacity?: number;
}

interface ProductionLine {
  id: string;
  name: string;
  machines: string[];
  status: "active" | "paused" | "stopped";
  output_rate: number;
  target_rate: number;
}

const statusColors: Record<string, string> = {
  running: "#22c55e", idle: "#f59e0b", maintenance: "#3b82f6", error: "#ef4444", offline: "#6b7280",
};
const statusLabels: Record<string, string> = {
  running: "\u05E4\u05E2\u05D9\u05DC", idle: "\u05D4\u05DE\u05EA\u05E0\u05D4", maintenance: "\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4", error: "\u05EA\u05E7\u05DC\u05D4", offline: "\u05DC\u05D0 \u05DE\u05D7\u05D5\u05D1\u05E8",
};

const defaultZones: Zone[] = [
  { id: "z1", name: "\u05D0\u05D6\u05D5\u05E8 \u05D9\u05D9\u05E6\u05D5\u05E8 A", type: "production", x: 50, y: 50, width: 350, height: 200, color: "#dbeafe" },
  { id: "z2", name: "\u05D0\u05D6\u05D5\u05E8 \u05D9\u05D9\u05E6\u05D5\u05E8 B", type: "production", x: 420, y: 50, width: 350, height: 200, color: "#dbeafe" },
  { id: "z3", name: "\u05DE\u05D7\u05E1\u05DF \u05D7\u05D5\u05DE\u05E8\u05D9 \u05D2\u05DC\u05DD", type: "warehouse", x: 50, y: 270, width: 250, height: 150, color: "#fef3c7" },
  { id: "z4", name: "\u05DE\u05D7\u05E1\u05DF \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD", type: "warehouse", x: 320, y: 270, width: 250, height: 150, color: "#dcfce7" },
  { id: "z5", name: "\u05D0\u05D6\u05D5\u05E8 \u05DE\u05E9\u05DC\u05D5\u05D7", type: "shipping", x: 590, y: 270, width: 180, height: 150, color: "#fce7f3" },
  { id: "z6", name: "\u05D0\u05D6\u05D5\u05E8 \u05E7\u05D1\u05DC\u05D4", type: "receiving", x: 50, y: 440, width: 180, height: 100, color: "#e0e7ff" },
];

const defaultMachines: Machine[] = [
  { id: "m1", name: "CNC-001", type: "cnc", x: 70, y: 80, width: 60, height: 40, status: "running", temperature: 45, efficiency: 92, output: 156 },
  { id: "m2", name: "CNC-002", type: "cnc", x: 150, y: 80, width: 60, height: 40, status: "running", temperature: 48, efficiency: 88, output: 142 },
  { id: "m3", name: "CNC-003", type: "cnc", x: 230, y: 80, width: 60, height: 40, status: "maintenance", temperature: 22, efficiency: 0, output: 0 },
  { id: "m4", name: "\u05D4\u05E8\u05DB\u05D1\u05D4-001", type: "assembly", x: 70, y: 150, width: 80, height: 40, status: "running", temperature: 35, efficiency: 95, output: 89 },
  { id: "m5", name: "\u05D4\u05E8\u05DB\u05D1\u05D4-002", type: "assembly", x: 170, y: 150, width: 80, height: 40, status: "idle", temperature: 28, efficiency: 0, output: 0 },
  { id: "m6", name: "\u05E8\u05D9\u05EA\u05D5\u05DA-001", type: "welding", x: 440, y: 80, width: 60, height: 40, status: "running", temperature: 85, efficiency: 90, output: 67 },
  { id: "m7", name: "\u05E8\u05D9\u05EA\u05D5\u05DA-002", type: "welding", x: 520, y: 80, width: 60, height: 40, status: "error", temperature: 120, efficiency: 0, output: 0, alerts: ["\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4 \u05D2\u05D1\u05D5\u05D4\u05D4"] },
  { id: "m8", name: "\u05D0\u05E8\u05D9\u05D6\u05D4-001", type: "packaging", x: 440, y: 150, width: 80, height: 40, status: "running", temperature: 30, efficiency: 97, output: 230 },
  { id: "m9", name: "\u05E6\u05D1\u05D9\u05E2\u05D4-001", type: "painting", x: 600, y: 80, width: 60, height: 40, status: "running", temperature: 55, efficiency: 85, output: 45 },
  { id: "m10", name: "\u05D1\u05D3\u05D9\u05E7\u05D4-001", type: "testing", x: 540, y: 150, width: 70, height: 40, status: "running", temperature: 25, efficiency: 98, output: 210 },
];

const defaultLines: ProductionLine[] = [
  { id: "l1", name: "\u05E7\u05D5 \u05D9\u05D9\u05E6\u05D5\u05E8 A", machines: ["m1", "m2", "m4", "m8"], status: "active", output_rate: 120, target_rate: 150 },
  { id: "l2", name: "\u05E7\u05D5 \u05D9\u05D9\u05E6\u05D5\u05E8 B", machines: ["m6", "m9", "m10"], status: "active", output_rate: 90, target_rate: 100 },
  { id: "l3", name: "\u05E7\u05D5 \u05D4\u05E8\u05DB\u05D1\u05D4", machines: ["m3", "m5"], status: "paused", output_rate: 0, target_rate: 80 },
];

export default function FactoryDigitalTwin() {
  const [machines, setMachines] = useState<Machine[]>(defaultMachines);
  const [zones] = useState<Zone[]>(defaultZones);
  const [lines] = useState<ProductionLine[]>(defaultLines);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Simulate real-time data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMachines(prev => prev.map(m => {
        if (m.status !== "running") return m;
        return {
          ...m,
          temperature: Math.max(20, Math.min(130, (m.temperature || 40) + (Math.random() - 0.5) * 4)),
          efficiency: Math.max(70, Math.min(100, (m.efficiency || 90) + (Math.random() - 0.5) * 3)),
          output: Math.max(0, (m.output || 0) + Math.floor(Math.random() * 3)),
        };
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const alerts = machines.filter(m => m.status === "error" || (m.temperature && m.temperature > 100) || (m.alerts && m.alerts.length > 0));
  const runningCount = machines.filter(m => m.status === "running").length;
  const avgEfficiency = machines.filter(m => m.status === "running").reduce((s, m) => s + (m.efficiency || 0), 0) / (runningCount || 1);
  const totalOutput = machines.reduce((s, m) => s + (m.output || 0), 0);

  const filteredMachines = machines.filter(m => {
    if (searchTerm && !m.name.includes(searchTerm) && !m.type.includes(searchTerm)) return false;
    if (filterStatus && m.status !== filterStatus) return false;
    return true;
  });

  return (
    <div ref={containerRef} className={`${isFullscreen ? "fixed inset-0 z-50 bg-white" : ""} p-4 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Factory className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold">\u05EA\u05D0\u05D5\u05DD \u05D3\u05D9\u05D2\u05D9\u05D8\u05DC\u05D9 - \u05DE\u05E4\u05EA</h2>
          <Badge className="bg-green-100 text-green-800"><Wifi className="w-3 h-3 ml-1" />\u05DE\u05D7\u05D5\u05D1\u05E8</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAlerts(!showAlerts)}>
            <AlertTriangle className="w-4 h-4 ml-1" />\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA ({alerts.length})
          </Button>
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div><p className="text-xs text-gray-500">\u05DE\u05DB\u05D5\u05E0\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA</p><p className="text-xl font-bold text-green-600">{runningCount}/{machines.length}</p></div>
            <Activity className="w-6 h-6 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div><p className="text-xs text-gray-500">\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05DE\u05DE\u05D5\u05E6\u05E2\u05EA</p><p className="text-xl font-bold">{avgEfficiency.toFixed(1)}%</p></div>
            <Gauge className="w-6 h-6 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div><p className="text-xs text-gray-500">\u05EA\u05E4\u05D5\u05E7\u05D4 \u05DB\u05D5\u05DC\u05DC\u05EA</p><p className="text-xl font-bold">{fmt(totalOutput)}</p></div>
            <Package className="w-6 h-6 text-purple-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div><p className="text-xs text-gray-500">\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA</p><p className="text-xl font-bold text-red-600">{alerts.length}</p></div>
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 2D Map */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-2">
              <svg viewBox="0 0 800 560" className="w-full h-auto bg-gray-50 rounded-lg border">
                {/* Grid */}
                {Array.from({ length: 17 }).map((_, i) => (
                  <line key={`gx${i}`} x1={i * 50} y1={0} x2={i * 50} y2={560} stroke="#f0f0f0" strokeWidth={0.5} />
                ))}
                {Array.from({ length: 12 }).map((_, i) => (
                  <line key={`gy${i}`} x1={0} y1={i * 50} x2={800} y2={i * 50} stroke="#f0f0f0" strokeWidth={0.5} />
                ))}

                {/* Zones */}
                {zones.map(z => (
                  <g key={z.id}>
                    <rect x={z.x} y={z.y} width={z.width} height={z.height}
                      fill={z.color} stroke="#94a3b8" strokeWidth={1} rx={4} opacity={0.6} />
                    <text x={z.x + z.width / 2} y={z.y + 16} textAnchor="middle"
                      fontSize={11} fill="#475569" fontWeight="bold">{z.name}</text>
                  </g>
                ))}

                {/* Production line connections */}
                {lines.map(line => {
                  const lineMachines = line.machines.map(mId => machines.find(m => m.id === mId)).filter(Boolean) as Machine[];
                  if (lineMachines.length < 2) return null;
                  return lineMachines.slice(0, -1).map((m, i) => {
                    const next = lineMachines[i + 1];
                    return (
                      <line key={`${line.id}-${i}`}
                        x1={m.x + m.width / 2} y1={m.y + m.height / 2}
                        x2={next.x + next.width / 2} y2={next.y + next.height / 2}
                        stroke={line.status === "active" ? "#3b82f6" : "#d1d5db"}
                        strokeWidth={2} strokeDasharray={line.status === "paused" ? "5,5" : "none"} opacity={0.5} />
                    );
                  });
                })}

                {/* Machines */}
                {filteredMachines.map(m => (
                  <g key={m.id} className="cursor-pointer" onClick={() => setSelectedMachine(m)}>
                    <rect x={m.x} y={m.y} width={m.width} height={m.height}
                      fill="white" stroke={statusColors[m.status]} strokeWidth={2.5} rx={4}
                      className="transition-all hover:opacity-80" />
                    {/* Status indicator dot */}
                    <circle cx={m.x + m.width - 8} cy={m.y + 8} r={4} fill={statusColors[m.status]} />
                    {/* Name */}
                    <text x={m.x + m.width / 2} y={m.y + m.height / 2 + 4} textAnchor="middle"
                      fontSize={9} fill="#1f2937" fontWeight="600">{m.name}</text>
                    {/* Alert icon */}
                    {m.status === "error" && (
                      <text x={m.x + 6} y={m.y + 14} fontSize={12} fill="#ef4444">!</text>
                    )}
                  </g>
                ))}

                {/* Legend */}
                <g transform="translate(620, 440)">
                  <rect x={0} y={0} width={170} height={110} fill="white" stroke="#e5e7eb" rx={4} />
                  <text x={85} y={18} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#374151">\u05DE\u05E7\u05E8\u05D0</text>
                  {Object.entries(statusColors).map(([status, color], i) => (
                    <g key={status} transform={`translate(10, ${28 + i * 16})`}>
                      <circle cx={6} cy={4} r={4} fill={color} />
                      <text x={16} y={8} fontSize={9} fill="#4b5563">{statusLabels[status]}</text>
                    </g>
                  ))}
                </g>
              </svg>
            </CardContent>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Search & Filter */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="relative">
                <Search className="absolute right-2 top-2 w-4 h-4 text-gray-400" />
                <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05DE\u05DB\u05D5\u05E0\u05D4..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pr-8 text-sm h-8" />
              </div>
              <select className="w-full border rounded px-2 py-1 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">\u05DB\u05DC \u05D4\u05E1\u05D8\u05D8\u05D5\u05E1\u05D9\u05DD</option>
                {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </CardContent>
          </Card>

          {/* Selected Machine Details */}
          {selectedMachine && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings className="w-4 h-4" />{selectedMachine.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span>\u05E1\u05D8\u05D8\u05D5\u05E1:</span><Badge className="text-xs" style={{ backgroundColor: statusColors[selectedMachine.status] + "30", color: statusColors[selectedMachine.status] }}>{statusLabels[selectedMachine.status]}</Badge></div>
                <div className="flex justify-between"><span>\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4:</span><span className={`font-bold ${(selectedMachine.temperature || 0) > 80 ? "text-red-600" : ""}`}>{selectedMachine.temperature?.toFixed(1)}\u00B0C</span></div>
                <div className="flex justify-between"><span>\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA:</span><span className="font-bold">{selectedMachine.efficiency?.toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>\u05EA\u05E4\u05D5\u05E7\u05D4:</span><span className="font-bold">{fmt(selectedMachine.output)}</span></div>
                {selectedMachine.alerts?.map((a, i) => (
                  <div key={i} className="flex items-center gap-1 text-red-600 text-xs"><AlertTriangle className="w-3 h-3" />{a}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Alerts Panel */}
          {showAlerts && alerts.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA ({alerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {alerts.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-sm p-2 bg-red-50 rounded cursor-pointer" onClick={() => setSelectedMachine(m)}>
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-red-600">{m.status === "error" ? "\u05EA\u05E7\u05DC\u05D4" : `\u05D8\u05DE\u05E4\u05F3 ${m.temperature?.toFixed(0)}\u00B0C`}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Production Lines */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4" />\u05E7\u05D5\u05D5\u05D9 \u05D9\u05D9\u05E6\u05D5\u05E8</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              {lines.map(line => (
                <div key={line.id} className="p-2 border rounded text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{line.name}</span>
                    <Badge className={line.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {line.status === "active" ? "\u05E4\u05E2\u05D9\u05DC" : "\u05DE\u05D5\u05E9\u05D4\u05D4"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, (line.output_rate / line.target_rate) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{line.output_rate}/{line.target_rate}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
