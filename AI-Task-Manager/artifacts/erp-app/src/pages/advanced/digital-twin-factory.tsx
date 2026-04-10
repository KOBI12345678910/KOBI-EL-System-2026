import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Factory, Activity, AlertTriangle, CheckCircle2, Wrench, Zap,
  Thermometer, Waves, Clock, TrendingUp, AlertCircle, Power,
  Gauge, Cpu, Settings, RefreshCw, Bell
} from "lucide-react";

type MachineStatus = "running" | "idle" | "maintenance" | "error";
type AlertLevel = "green" | "yellow" | "red";

interface Machine {
  id: string;
  name: string;
  type: string;
  status: MachineStatus;
  oee: number;
  alertLevel: AlertLevel;
  temperature: number;
  vibration: number;
  runtime: number;
  production: number;
  efficiency: number;
  operator: string;
  lastMaintenance: string;
  nextMaintenance: string;
}

interface PredictiveAlert {
  machineId: string;
  machineName: string;
  severity: "critical" | "warning" | "info";
  message: string;
  predictedFailure: string;
  confidence: number;
}

const MOCK_MACHINES: Machine[] = [
  { id: "M01", name: "CNC חותך 01", type: "CNC Cutter", status: "running", oee: 92, alertLevel: "green", temperature: 68, vibration: 2.1, runtime: 18.5, production: 245, efficiency: 94, operator: "יוסי כהן", lastMaintenance: "2026-03-15", nextMaintenance: "2026-05-15" },
  { id: "M02", name: "רובוט ריתוך A", type: "Welding Robot", status: "running", oee: 88, alertLevel: "green", temperature: 72, vibration: 1.8, runtime: 22.3, production: 189, efficiency: 91, operator: "דנה לוי", lastMaintenance: "2026-03-10", nextMaintenance: "2026-05-10" },
  { id: "M03", name: "מכבש הידראולי", type: "Hydraulic Press", status: "error", oee: 0, alertLevel: "red", temperature: 95, vibration: 5.8, runtime: 0, production: 0, efficiency: 0, operator: "-", lastMaintenance: "2026-02-20", nextMaintenance: "2026-04-12" },
  { id: "M04", name: "קו הרכבה ראשי", type: "Assembly Line", status: "running", oee: 85, alertLevel: "yellow", temperature: 78, vibration: 3.2, runtime: 14.8, production: 312, efficiency: 87, operator: "משה אברהם", lastMaintenance: "2026-03-25", nextMaintenance: "2026-05-25" },
  { id: "M05", name: "מחרטת CNC 02", type: "CNC Lathe", status: "running", oee: 94, alertLevel: "green", temperature: 65, vibration: 1.5, runtime: 19.2, production: 267, efficiency: 96, operator: "רחל דוד", lastMaintenance: "2026-03-28", nextMaintenance: "2026-05-28" },
  { id: "M06", name: "תנור חימום", type: "Heat Furnace", status: "maintenance", oee: 0, alertLevel: "yellow", temperature: 120, vibration: 0, runtime: 0, production: 0, efficiency: 0, operator: "צוות אחזקה", lastMaintenance: "2026-04-09", nextMaintenance: "2026-04-10" },
  { id: "M07", name: "רובוט ריתוך B", type: "Welding Robot", status: "running", oee: 89, alertLevel: "green", temperature: 70, vibration: 1.9, runtime: 20.1, production: 198, efficiency: 92, operator: "אלון פרץ", lastMaintenance: "2026-03-18", nextMaintenance: "2026-05-18" },
  { id: "M08", name: "מכונת צביעה", type: "Painting Booth", status: "running", oee: 82, alertLevel: "yellow", temperature: 85, vibration: 2.8, runtime: 16.5, production: 156, efficiency: 84, operator: "שרה גולד", lastMaintenance: "2026-03-22", nextMaintenance: "2026-05-22" },
  { id: "M09", name: "CNC חותך 03", type: "CNC Cutter", status: "idle", oee: 78, alertLevel: "green", temperature: 45, vibration: 0.5, runtime: 8.3, production: 98, efficiency: 80, operator: "תמר לב", lastMaintenance: "2026-03-30", nextMaintenance: "2026-05-30" },
  { id: "M10", name: "מכונת אריזה", type: "Packaging", status: "running", oee: 91, alertLevel: "green", temperature: 62, vibration: 1.3, runtime: 21.7, production: 423, efficiency: 93, operator: "דוד כרמי", lastMaintenance: "2026-04-01", nextMaintenance: "2026-06-01" },
  { id: "M11", name: "בדיקת איכות AI", type: "Quality Inspection", status: "running", oee: 96, alertLevel: "green", temperature: 55, vibration: 0.8, runtime: 23.4, production: 534, efficiency: 97, operator: "אוטומטי", lastMaintenance: "2026-03-12", nextMaintenance: "2026-05-12" },
  { id: "M12", name: "לייזר חריטה", type: "Laser Engraver", status: "running", oee: 87, alertLevel: "yellow", temperature: 75, vibration: 2.4, runtime: 17.9, production: 221, efficiency: 89, operator: "נועה שרון", lastMaintenance: "2026-03-20", nextMaintenance: "2026-05-20" },
];

const MOCK_ALERTS: PredictiveAlert[] = [
  { machineId: "M03", machineName: "מכבש הידראולי", severity: "critical", message: "כשל בחיישן הלחץ — דורש החלפה מיידית", predictedFailure: "עכשיו", confidence: 98 },
  { machineId: "M04", machineName: "קו הרכבה ראשי", severity: "warning", message: "ויברציה חריגה בציר Y — בדיקה נדרשת", predictedFailure: "תוך 48 שעות", confidence: 84 },
  { machineId: "M08", machineName: "מכונת צביעה", severity: "warning", message: "טמפרטורה עולה מעל הרגיל", predictedFailure: "תוך 5 ימים", confidence: 76 },
  { machineId: "M12", machineName: "לייזר חריטה", severity: "info", message: "צפויה החלפת עדשה בקרוב", predictedFailure: "תוך 14 ימים", confidence: 65 },
];

const STATUS_CONFIG: Record<MachineStatus, { label: string; color: string; bg: string; border: string; icon: any }> = {
  running: { label: "פועל", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/40", icon: Activity },
  idle: { label: "במנוחה", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/40", icon: Power },
  maintenance: { label: "אחזקה", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40", icon: Wrench },
  error: { label: "תקלה", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/40", icon: AlertTriangle },
};

const ALERT_COLORS: Record<AlertLevel, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

export default function DigitalTwinFactory() {
  const [selectedMachine, setSelectedMachine] = useState<string | null>("M01");

  const { data, isLoading } = useQuery({
    queryKey: ["digital-twin"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/advanced/digital-twin");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { machines: MOCK_MACHINES, alerts: MOCK_ALERTS };
      }
    },
  });

  const machines: Machine[] = data?.machines || MOCK_MACHINES;
  const alerts: PredictiveAlert[] = data?.alerts || MOCK_ALERTS;

  const kpis = {
    total: machines.length,
    running: machines.filter((m) => m.status === "running").length,
    avgOEE: Math.round(machines.filter((m) => m.status === "running").reduce((a, m) => a + m.oee, 0) / Math.max(1, machines.filter((m) => m.status === "running").length)),
    alerts: machines.filter((m) => m.alertLevel !== "green").length,
    downtime: machines.filter((m) => m.status === "error" || m.status === "maintenance").length * 4.5,
  };

  const selected = machines.find((m) => m.id === selectedMachine) || machines[0];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/40">
            <Factory className="h-7 w-7 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">תאום דיגיטלי — מפת המפעל</h1>
            <p className="text-sm text-gray-400">ניטור זמן-אמת של קומת הייצור עם מצב חי של כל המכונות</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-[#1f2937] bg-[#111827]">
            <RefreshCw className="h-4 w-4 ml-2" /> רענן
          </Button>
          <Button className="bg-cyan-600 hover:bg-cyan-700">
            <Settings className="h-4 w-4 ml-2" /> הגדרות
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4 mb-6">
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">סך מכונות</div>
                <div className="text-2xl font-bold">{kpis.total}</div>
              </div>
              <Factory className="h-8 w-8 text-cyan-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">פועלות כעת</div>
                <div className="text-2xl font-bold text-green-400">{kpis.running}</div>
              </div>
              <Activity className="h-8 w-8 text-green-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">OEE ממוצע</div>
                <div className="text-2xl font-bold text-cyan-400">{kpis.avgOEE}%</div>
              </div>
              <Gauge className="h-8 w-8 text-cyan-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">התראות פעילות</div>
                <div className="text-2xl font-bold text-amber-400">{kpis.alerts}</div>
              </div>
              <Bell className="h-8 w-8 text-amber-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 mb-1">השבתה היום</div>
                <div className="text-2xl font-bold text-red-400">{kpis.downtime.toFixed(1)}ש</div>
              </div>
              <Clock className="h-8 w-8 text-red-400/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-3">
          <Card className="bg-[#111827] border-[#1f2937] mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Cpu className="h-5 w-5 text-cyan-400" />
                פריסת קומת הייצור — ניטור חי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                {machines.map((machine) => {
                  const config = STATUS_CONFIG[machine.status];
                  const StatusIcon = config.icon;
                  const isSelected = selectedMachine === machine.id;
                  const isPulsing = machine.alertLevel === "red";
                  return (
                    <div
                      key={machine.id}
                      onClick={() => setSelectedMachine(machine.id)}
                      className={`relative cursor-pointer rounded-xl border-2 p-3 transition-all ${
                        isSelected ? "border-cyan-500 bg-cyan-500/5" : `${config.border} ${config.bg}`
                      } hover:scale-[1.02]`}
                    >
                      <div className={`absolute top-2 left-2 h-3 w-3 rounded-full ${ALERT_COLORS[machine.alertLevel]} ${isPulsing ? "animate-pulse" : ""}`} />
                      <div className="flex items-center gap-2 mb-2">
                        <StatusIcon className={`h-4 w-4 ${config.color}`} />
                        <span className="text-xs text-gray-400">{machine.id}</span>
                      </div>
                      <div className="text-sm font-semibold mb-1 truncate">{machine.name}</div>
                      <div className="text-xs text-gray-500 mb-2 truncate">{machine.type}</div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">OEE</span>
                          <span className={config.color}>{machine.oee}%</span>
                        </div>
                        <Progress value={machine.oee} className="h-1" />
                        <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                          <div className="flex items-center gap-1">
                            <Thermometer className="h-3 w-3" />
                            {machine.temperature}°
                          </div>
                          <div className="flex items-center gap-1">
                            <Waves className="h-3 w-3" />
                            {machine.vibration.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-cyan-400" />
                טלמטריה מפורטת — {selected.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-4 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className="h-5 w-5 text-orange-400" />
                    <span className="text-sm text-gray-400">טמפרטורה</span>
                  </div>
                  <div className="text-3xl font-bold text-orange-400">{selected.temperature}°C</div>
                  <div className="mt-2 h-2 bg-[#1f2937] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500" style={{ width: `${(selected.temperature / 150) * 100}%` }} />
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <div className="flex items-center gap-2 mb-2">
                    <Waves className="h-5 w-5 text-purple-400" />
                    <span className="text-sm text-gray-400">ויברציה</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-400">{selected.vibration.toFixed(1)} mm/s</div>
                  <div className="mt-2 h-2 bg-[#1f2937] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500" style={{ width: `${(selected.vibration / 10) * 100}%` }} />
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-5 w-5 text-cyan-400" />
                    <span className="text-sm text-gray-400">זמן ריצה</span>
                  </div>
                  <div className="text-3xl font-bold text-cyan-400">{selected.runtime}h</div>
                  <div className="mt-2 h-2 bg-[#1f2937] rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${(selected.runtime / 24) * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <div className="text-sm text-gray-400 mb-3">ביצועים ויצרנות</div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">יעילות</span>
                        <span className="text-green-400">{selected.efficiency}%</span>
                      </div>
                      <Progress value={selected.efficiency} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">OEE כללי</span>
                        <span className="text-cyan-400">{selected.oee}%</span>
                      </div>
                      <Progress value={selected.oee} className="h-2" />
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-[#1f2937]">
                      <span className="text-gray-400">יחידות היום</span>
                      <span className="text-white font-bold">{selected.production}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <div className="text-sm text-gray-400 mb-3">פרטי מכונה</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">סוג:</span>
                      <span>{selected.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">מפעיל:</span>
                      <span>{selected.operator}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">אחזקה אחרונה:</span>
                      <span>{selected.lastMaintenance}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">אחזקה הבאה:</span>
                      <span className="text-amber-400">{selected.nextMaintenance}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-[#1f2937]">
                      <span className="text-gray-500">סטטוס:</span>
                      <Badge className={`${STATUS_CONFIG[selected.status].bg} ${STATUS_CONFIG[selected.status].color} border-none`}>
                        {STATUS_CONFIG[selected.status].label}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-1">
          <Card className="bg-[#111827] border-[#1f2937] sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Zap className="h-5 w-5 text-amber-400" />
                אחזקה חזויה
              </CardTitle>
              <p className="text-xs text-gray-400">התראות AI על מכונות הדורשות תשומת לב</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.map((alert, i) => {
                const borderColor = alert.severity === "critical" ? "border-red-500/40" : alert.severity === "warning" ? "border-amber-500/40" : "border-blue-500/40";
                const bgColor = alert.severity === "critical" ? "bg-red-500/5" : alert.severity === "warning" ? "bg-amber-500/5" : "bg-blue-500/5";
                const textColor = alert.severity === "critical" ? "text-red-400" : alert.severity === "warning" ? "text-amber-400" : "text-blue-400";
                const AlertIcon = alert.severity === "critical" ? AlertCircle : alert.severity === "warning" ? AlertTriangle : CheckCircle2;
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedMachine(alert.machineId)}
                    className={`p-3 rounded-lg border-2 ${borderColor} ${bgColor} cursor-pointer hover:scale-[1.02] transition-all ${alert.severity === "critical" ? "animate-pulse" : ""}`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <AlertIcon className={`h-4 w-4 ${textColor} mt-0.5 flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{alert.machineName}</div>
                        <div className="text-xs text-gray-400 mt-1">{alert.message}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#1f2937]">
                      <span className="text-gray-500">חיזוי: {alert.predictedFailure}</span>
                      <Badge variant="outline" className={`${textColor} ${borderColor}`}>
                        <TrendingUp className="h-3 w-3 ml-1" />
                        {alert.confidence}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 border-t border-[#1f2937]">
                <Button className="w-full bg-cyan-600 hover:bg-cyan-700" size="sm">
                  <Wrench className="h-4 w-4 ml-2" /> תזמון אחזקה
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="bg-[#111827] border-[#1f2937] mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-white text-base">
            <Activity className="h-5 w-5 text-cyan-400" />
            סיכום ייצור — 24 שעות אחרונות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-3">
            <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
              <div className="text-xs text-gray-400 mb-1">סך יחידות שיוצרו</div>
              <div className="text-xl font-bold text-cyan-400">{machines.reduce((a, m) => a + m.production, 0).toLocaleString("he-IL")}</div>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-green-400">
                <TrendingUp className="h-3 w-3" /> +12% מאתמול
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
              <div className="text-xs text-gray-400 mb-1">יעילות ממוצעת</div>
              <div className="text-xl font-bold text-green-400">
                {Math.round(machines.filter((m) => m.status === "running").reduce((a, m) => a + m.efficiency, 0) / machines.filter((m) => m.status === "running").length)}%
              </div>
              <Progress value={89} className="h-1 mt-2" />
            </div>
            <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
              <div className="text-xs text-gray-400 mb-1">זמן פעילות ממוצע</div>
              <div className="text-xl font-bold text-purple-400">
                {(machines.filter((m) => m.runtime > 0).reduce((a, m) => a + m.runtime, 0) / Math.max(1, machines.filter((m) => m.runtime > 0).length)).toFixed(1)}h
              </div>
              <div className="text-[10px] text-gray-500 mt-1">מתוך 24 שעות</div>
            </div>
            <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
              <div className="text-xs text-gray-400 mb-1">ממוצע טמפרטורה</div>
              <div className="text-xl font-bold text-orange-400">
                {Math.round(machines.reduce((a, m) => a + m.temperature, 0) / machines.length)}°C
              </div>
              <div className="text-[10px] text-gray-500 mt-1">תקין</div>
            </div>
            <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
              <div className="text-xs text-gray-400 mb-1">ויברציה ממוצעת</div>
              <div className="text-xl font-bold text-amber-400">
                {(machines.reduce((a, m) => a + m.vibration, 0) / machines.length).toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">mm/s</div>
            </div>
            <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
              <div className="text-xs text-gray-400 mb-1">תקלות פתוחות</div>
              <div className="text-xl font-bold text-red-400">
                {machines.filter((m) => m.status === "error").length}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">דורש טיפול</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#111827] border-[#1f2937] mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-white text-base">
            <Gauge className="h-5 w-5 text-cyan-400" />
            השוואת OEE — מכונות מובילות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...machines].filter((m) => m.status === "running").sort((a, b) => b.oee - a.oee).slice(0, 8).map((m) => {
              const barColor = m.oee >= 90 ? "bg-green-500" : m.oee >= 80 ? "bg-cyan-500" : "bg-amber-500";
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-mono">{m.id}</span>
                      <span className="text-white font-medium">{m.name}</span>
                      <span className="text-gray-500">•</span>
                      <span className="text-gray-500">{m.type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500">{m.production} יחידות</span>
                      <span className={`font-bold ${m.oee >= 90 ? "text-green-400" : m.oee >= 80 ? "text-cyan-400" : "text-amber-400"}`}>{m.oee}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden border border-[#1f2937]">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${m.oee}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
