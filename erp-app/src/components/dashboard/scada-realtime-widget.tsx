import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { createPageUrl } from "@/lib/route-map";
import { Activity, AlertTriangle, CheckCircle2, Zap, Thermometer, Gauge } from "lucide-react";

interface MachineStatus {
  id: number;
  name: string;
  status: "running" | "warning" | "idle" | "error";
  temperature: number;
  vibration: number;
  pressure: number;
  health: number;
}

interface SCADAAlert {
  id: number;
  machine: string;
  severity: string;
  message: string;
  value: number;
}

export default function SCADARealtimeWidget() {
  const machineStatus: MachineStatus[] = [
    { id: 1, name: "CNC מכונה #1", status: "running", temperature: 42, vibration: 2.1, pressure: 85, health: 95 },
    { id: 2, name: "מכונת ריתוך #2", status: "warning", temperature: 68, vibration: 4.5, pressure: 92, health: 72 },
    { id: 3, name: "מכונת ליטוש #3", status: "running", temperature: 35, vibration: 1.8, pressure: 78, health: 98 },
    { id: 4, name: "מכונת צביעה #4", status: "idle", temperature: 28, vibration: 0, pressure: 65, health: 85 },
  ];

  const alerts: SCADAAlert[] = [
    { id: 1, machine: "מכונת ריתוך #2", severity: "high", message: "טמפרטורה חרגה מהסף", value: 68 },
    { id: 2, machine: "CNC מכונה #1", severity: "medium", message: "רטט מעלה טיפה", value: 2.1 },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running": return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case "idle": return <Activity className="w-4 h-4 text-slate-400" />;
      default: return <Zap className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = { running: "פעיל", warning: "אזהרה", idle: "סרק", error: "תקלה" };
    return labels[status] || status;
  };

  const getHealthColor = (health: number) => {
    if (health >= 90) return "bg-green-100 text-green-800";
    if (health >= 75) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <Card className="border-0 shadow-sm lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-600" />
          ניטור SCADA בזמן אמת
        </CardTitle>
        <Link href={createPageUrl("SCADA")}>
          <Button variant="ghost" size="sm">פרטים מלאים</Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {alerts.length > 0 && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-xs font-semibold text-orange-900 mb-2">התראות פעילות</p>
            <div className="space-y-1">
              {alerts.map((alert) => (
                <div key={alert.id} className="text-xs text-orange-700">
                  • {alert.machine}: {alert.message} ({alert.value})
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {machineStatus.map((machine) => (
            <div key={machine.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(machine.status)}
                  <p className="text-xs font-semibold text-slate-900">{machine.name}</p>
                </div>
                <Badge className={
                  machine.status === "running" ? "bg-green-100 text-green-800" :
                  machine.status === "warning" ? "bg-orange-100 text-orange-800" :
                  "bg-slate-100 text-slate-800"
                }>
                  {getStatusLabel(machine.status)}
                </Badge>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 flex items-center gap-1"><Thermometer className="w-3 h-3" /> טמפ'</span>
                  <span className="font-semibold">{machine.temperature}°C</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 flex items-center gap-1"><Activity className="w-3 h-3" /> רטט</span>
                  <span className="font-semibold">{machine.vibration} mm/s</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 flex items-center gap-1"><Gauge className="w-3 h-3" /> לחץ</span>
                  <span className="font-semibold">{machine.pressure} bar</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-slate-600">בריאות</span>
                  <Badge className={getHealthColor(machine.health)}>{machine.health}%</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
