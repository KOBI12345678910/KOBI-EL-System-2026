import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Clock, Users, Timer, Cpu, TrendingUp, AlertTriangle,
  Wrench, Settings, DollarSign, BarChart3, Activity, Zap,
} from "lucide-react";

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;
const hrs = (v: number) => v.toFixed(1);

/* ── Labor log data ── */
const laborLog = [
  { id: 1, name: "רועי כהן", clockIn: "06:55", clockOut: "16:30", job: "WO-4510", jobHrs: 7.2, indirectHrs: 1.1, overtime: 1.5, total: 9.58, costPerHr: 95 },
  { id: 2, name: "אמיר לוי", clockIn: "07:00", clockOut: "16:00", job: "WO-4512", jobHrs: 6.8, indirectHrs: 1.2, overtime: 1.0, total: 9.0, costPerHr: 88 },
  { id: 3, name: "יוסי מזרחי", clockIn: "06:45", clockOut: "17:00", job: "WO-4510", jobHrs: 8.0, indirectHrs: 0.75, overtime: 2.0, total: 10.25, costPerHr: 105 },
  { id: 4, name: "דני אברהם", clockIn: "07:10", clockOut: "15:30", job: "WO-4515", jobHrs: 6.5, indirectHrs: 0.8, overtime: 0, total: 8.33, costPerHr: 82 },
  { id: 5, name: "מוחמד חסן", clockIn: "07:00", clockOut: "16:15", job: "WO-4518", jobHrs: 7.0, indirectHrs: 1.0, overtime: 1.25, total: 9.25, costPerHr: 90 },
  { id: 6, name: "אלי ביטון", clockIn: "06:30", clockOut: "17:30", job: "WO-4520", jobHrs: 8.5, indirectHrs: 0.5, overtime: 2.5, total: 11.0, costPerHr: 100 },
  { id: 7, name: "שרה לוי", clockIn: "07:15", clockOut: "15:45", job: "WO-4522", jobHrs: 6.0, indirectHrs: 1.5, overtime: 0, total: 8.5, costPerHr: 78 },
  { id: 8, name: "נועה פרידמן", clockIn: "07:00", clockOut: "16:00", job: "WO-4525", jobHrs: 6.5, indirectHrs: 1.0, overtime: 0.5, total: 9.0, costPerHr: 85 },
  { id: 9, name: "עומר דהן", clockIn: "06:50", clockOut: "16:20", job: "WO-4510", jobHrs: 7.5, indirectHrs: 0.8, overtime: 1.2, total: 9.5, costPerHr: 92 },
  { id: 10, name: "טל אזולאי", clockIn: "07:30", clockOut: "15:30", job: "WO-4530", jobHrs: 5.8, indirectHrs: 1.2, overtime: 0, total: 8.0, costPerHr: 80 },
];

/* ── Machine log data ── */
const machineLog = [
  { id: 1, station: "CNC-01 חיתוך לייזר", runtime: 7.2, setup: 0.8, idle: 0.5, downtime: 0.3, util: 81.8, costPerHr: 180 },
  { id: 2, station: "CNC-02 כיפוף", runtime: 6.5, setup: 1.2, idle: 0.8, downtime: 0.5, util: 72.2, costPerHr: 160 },
  { id: 3, station: "ריתוך רובוטי A", runtime: 8.0, setup: 0.5, idle: 0.3, downtime: 0.2, util: 88.9, costPerHr: 200 },
  { id: 4, station: "ריתוך רובוטי B", runtime: 7.5, setup: 0.7, idle: 0.5, downtime: 0.3, util: 83.3, costPerHr: 200 },
  { id: 5, station: "מכבש הידראולי", runtime: 6.0, setup: 1.0, idle: 1.2, downtime: 0.8, util: 66.7, costPerHr: 150 },
  { id: 6, station: "מסור סרט אוטומטי", runtime: 7.8, setup: 0.4, idle: 0.3, downtime: 0.1, util: 90.7, costPerHr: 120 },
  { id: 7, station: "תחנת צביעה אלקטרוסטטית", runtime: 5.5, setup: 1.5, idle: 1.0, downtime: 1.0, util: 61.1, costPerHr: 170 },
  { id: 8, station: "מקדחה תעשייתית", runtime: 6.8, setup: 0.6, idle: 0.8, downtime: 0.4, util: 79.1, costPerHr: 90 },
  { id: 9, station: "משחזת שטוחה", runtime: 5.0, setup: 0.8, idle: 1.5, downtime: 1.2, util: 58.8, costPerHr: 85 },
  { id: 10, station: "מכונת גלגור", runtime: 7.0, setup: 0.5, idle: 0.7, downtime: 0.3, util: 82.4, costPerHr: 140 },
];

/* ── Cost allocation data ── */
const costAllocation = [
  { job: "WO-4510", project: "שער חשמלי Premium", laborHrs: 22.7, laborCost: 2120, machineHrs: 14.5, machineCost: 2610, totalCost: 4730 },
  { job: "WO-4512", project: "פרגולה אלומיניום 4x5", laborHrs: 6.8, laborCost: 598, machineHrs: 5.5, machineCost: 935, totalCost: 1533 },
  { job: "WO-4515", project: "מעקה נירוסטה 12 מ׳", laborHrs: 6.5, laborCost: 533, machineHrs: 6.0, machineCost: 900, totalCost: 1433 },
  { job: "WO-4518", project: "דלת כניסה מפלדה", laborHrs: 7.0, laborCost: 630, machineHrs: 7.8, machineCost: 936, totalCost: 1566 },
  { job: "WO-4520", project: "חלון אלומיניום כפול", laborHrs: 8.5, laborCost: 850, machineHrs: 6.8, machineCost: 612, totalCost: 1462 },
  { job: "WO-4522", project: "גדר מתכת דקורטיבית", laborHrs: 6.0, laborCost: 468, machineHrs: 7.0, machineCost: 980, totalCost: 1448 },
  { job: "WO-4525", project: "מדרגות ברזל ספירלה", laborHrs: 6.5, laborCost: 553, machineHrs: 5.0, machineCost: 425, totalCost: 978 },
  { job: "WO-4530", project: "תריס גלילה חשמלי", laborHrs: 5.8, laborCost: 464, machineHrs: 7.2, machineCost: 1296, totalCost: 1760 },
];

/* ── KPI calculations ── */
const workersClockedIn = laborLog.length;
const totalLaborHrs = laborLog.reduce((s, w) => s + w.total, 0);
const totalOvertimeHrs = laborLog.reduce((s, w) => s + w.overtime, 0);
const machinesRunning = machineLog.filter(m => m.runtime > 0).length;
const avgMachineUtil = Math.round(machineLog.reduce((s, m) => s + m.util, 0) / machineLog.length);
const totalDowntimeHrs = machineLog.reduce((s, m) => s + m.downtime, 0);

const utilColor = (v: number) => {
  if (v >= 85) return "text-green-400";
  if (v >= 70) return "text-yellow-400";
  return "text-red-400";
};
const utilBg = (v: number) => {
  if (v >= 85) return "bg-green-500";
  if (v >= 70) return "bg-yellow-500";
  return "bg-red-500";
};

/* ═══════════════ Component ═══════════════ */
export default function LaborTimeTracking() {
  const [tab, setTab] = useState("labor");

  const kpis = [
    { label: "עובדים מחוברים", value: workersClockedIn, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "סה״כ שעות עבודה", value: hrs(totalLaborHrs), icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "שעות נוספות", value: hrs(totalOvertimeHrs), icon: Timer, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "מכונות פעילות", value: `${machinesRunning}/${machineLog.length}`, icon: Cpu, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "ניצולת מכונות", value: `${avgMachineUtil}%`, icon: TrendingUp, color: utilColor(avgMachineUtil), bg: "bg-amber-500/10" },
    { label: "השבתה כוללת", value: `${hrs(totalDowntimeHrs)} שע׳`, icon: AlertTriangle, color: totalDowntimeHrs > 5 ? "text-red-400" : "text-amber-400", bg: totalDowntimeHrs > 5 ? "bg-red-500/10" : "bg-amber-500/10" },
  ];

  return (
    <div className="p-6 space-y-5 bg-gray-950 min-h-screen text-gray-100" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Clock className="h-7 w-7 text-cyan-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מעקב שעות עובד ומכונה</h1>
          <p className="text-xs text-gray-500 mt-0.5">טכנו-כל עוזי | מעקב שעות עבודה, זמני מכונה, שעות נוספות ועלויות</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="bg-gray-900 border-gray-800">
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
              <span className="text-xl font-bold text-white">{k.value}</span>
              <span className="text-[11px] text-gray-400">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="labor" className="gap-1.5 data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-300">
            <Users className="h-3.5 w-3.5" /> שעות עובד
          </TabsTrigger>
          <TabsTrigger value="machine" className="gap-1.5 data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-300">
            <Cpu className="h-3.5 w-3.5" /> שעות מכונה
          </TabsTrigger>
          <TabsTrigger value="daily" className="gap-1.5 data-[state=active]:bg-green-600/20 data-[state=active]:text-green-300">
            <BarChart3 className="h-3.5 w-3.5" /> סיכום יומי
          </TabsTrigger>
          <TabsTrigger value="costs" className="gap-1.5 data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-300">
            <DollarSign className="h-3.5 w-3.5" /> עלויות
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: שעות עובד ── */}
        <TabsContent value="labor">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">עובד</TableHead>
                    <TableHead className="text-gray-400 text-center">כניסה</TableHead>
                    <TableHead className="text-gray-400 text-center">יציאה</TableHead>
                    <TableHead className="text-gray-400 text-center">הזמנה</TableHead>
                    <TableHead className="text-gray-400 text-center">שעות עבודה</TableHead>
                    <TableHead className="text-gray-400 text-center">שעות עקיפות</TableHead>
                    <TableHead className="text-gray-400 text-center">שעות נוספות</TableHead>
                    <TableHead className="text-gray-400 text-center">סה״כ</TableHead>
                    <TableHead className="text-gray-400 text-left">עלות ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {laborLog.map(w => {
                    const cost = Math.round(w.total * w.costPerHr + w.overtime * w.costPerHr * 0.25);
                    return (
                      <TableRow key={w.id} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell className="font-medium text-white">{w.name}</TableCell>
                        <TableCell className="text-center text-green-400 font-mono text-sm">{w.clockIn}</TableCell>
                        <TableCell className="text-center text-red-400 font-mono text-sm">{w.clockOut}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-blue-500/20 text-blue-300 text-xs">{w.job}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-gray-200">{hrs(w.jobHrs)}</TableCell>
                        <TableCell className="text-center text-gray-400">{hrs(w.indirectHrs)}</TableCell>
                        <TableCell className="text-center">
                          {w.overtime > 0
                            ? <Badge className="bg-purple-500/20 text-purple-300 text-xs">{hrs(w.overtime)}</Badge>
                            : <span className="text-gray-600">0.0</span>}
                        </TableCell>
                        <TableCell className="text-center font-bold text-white">{hrs(w.total)}</TableCell>
                        <TableCell className="text-left text-amber-300 font-mono">{fmt(cost)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: שעות מכונה ── */}
        <TabsContent value="machine">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">תחנה / מכונה</TableHead>
                    <TableHead className="text-gray-400 text-center">ריצה</TableHead>
                    <TableHead className="text-gray-400 text-center">הכנה</TableHead>
                    <TableHead className="text-gray-400 text-center">סרק</TableHead>
                    <TableHead className="text-gray-400 text-center">השבתה</TableHead>
                    <TableHead className="text-gray-400 text-center">ניצולת %</TableHead>
                    <TableHead className="text-gray-400 text-left">עלות ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machineLog.map(m => {
                    const totalHrs = m.runtime + m.setup + m.idle + m.downtime;
                    const cost = Math.round(totalHrs * m.costPerHr);
                    return (
                      <TableRow key={m.id} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell className="font-medium text-white">{m.station}</TableCell>
                        <TableCell className="text-center text-green-400">{hrs(m.runtime)}</TableCell>
                        <TableCell className="text-center text-yellow-400">{hrs(m.setup)}</TableCell>
                        <TableCell className="text-center text-gray-400">{hrs(m.idle)}</TableCell>
                        <TableCell className="text-center">
                          {m.downtime > 0
                            ? <Badge className="bg-red-500/20 text-red-300 text-xs">{hrs(m.downtime)}</Badge>
                            : <span className="text-gray-600">0.0</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress value={m.util} className={`h-2 w-16 ${utilBg(m.util)}`} />
                            <span className={`font-bold text-sm ${utilColor(m.util)}`}>{m.util.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-left text-amber-300 font-mono">{fmt(cost)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: סיכום יומי ── */}
        <TabsContent value="daily" className="space-y-4">
          {/* Worker summary */}
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-5 w-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-white">סיכום יומי - עובדים</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">עובד</TableHead>
                    <TableHead className="text-gray-400 text-center">שעות עבודה</TableHead>
                    <TableHead className="text-gray-400 text-center">שעות עקיפות</TableHead>
                    <TableHead className="text-gray-400 text-center">שעות נוספות</TableHead>
                    <TableHead className="text-gray-400 text-center">סה״כ שעות</TableHead>
                    <TableHead className="text-gray-400 text-center">יעילות</TableHead>
                    <TableHead className="text-gray-400 text-left">עלות כוללת ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {laborLog.map(w => {
                    const eff = Math.round((w.jobHrs / w.total) * 100);
                    const cost = Math.round(w.total * w.costPerHr + w.overtime * w.costPerHr * 0.25);
                    return (
                      <TableRow key={w.id} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell className="font-medium text-white">{w.name}</TableCell>
                        <TableCell className="text-center text-gray-200">{hrs(w.jobHrs)}</TableCell>
                        <TableCell className="text-center text-gray-400">{hrs(w.indirectHrs)}</TableCell>
                        <TableCell className="text-center">
                          {w.overtime > 0
                            ? <span className="text-purple-300">{hrs(w.overtime)}</span>
                            : <span className="text-gray-600">—</span>}
                        </TableCell>
                        <TableCell className="text-center font-bold text-white">{hrs(w.total)}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={eff >= 80 ? "bg-green-500/20 text-green-300" : eff >= 65 ? "bg-yellow-500/20 text-yellow-300" : "bg-red-500/20 text-red-300"}>
                            {eff}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-left text-amber-300 font-mono">{fmt(cost)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-gray-700 bg-gray-800/60 font-bold">
                    <TableCell className="text-white">סה״כ</TableCell>
                    <TableCell className="text-center text-white">{hrs(laborLog.reduce((s, w) => s + w.jobHrs, 0))}</TableCell>
                    <TableCell className="text-center text-white">{hrs(laborLog.reduce((s, w) => s + w.indirectHrs, 0))}</TableCell>
                    <TableCell className="text-center text-purple-300">{hrs(totalOvertimeHrs)}</TableCell>
                    <TableCell className="text-center text-white">{hrs(totalLaborHrs)}</TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-blue-500/20 text-blue-300">ממוצע {Math.round(laborLog.reduce((s, w) => s + (w.jobHrs / w.total) * 100, 0) / laborLog.length)}%</Badge>
                    </TableCell>
                    <TableCell className="text-left text-amber-300 font-mono">
                      {fmt(laborLog.reduce((s, w) => s + Math.round(w.total * w.costPerHr + w.overtime * w.costPerHr * 0.25), 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Machine summary */}
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="h-5 w-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">סיכום יומי - מכונות</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">תחנה</TableHead>
                    <TableHead className="text-gray-400 text-center">ריצה</TableHead>
                    <TableHead className="text-gray-400 text-center">הכנה</TableHead>
                    <TableHead className="text-gray-400 text-center">סרק + השבתה</TableHead>
                    <TableHead className="text-gray-400 text-center">סה״כ שעות</TableHead>
                    <TableHead className="text-gray-400 text-center">ניצולת</TableHead>
                    <TableHead className="text-gray-400 text-left">עלות ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machineLog.map(m => {
                    const totalHrs = m.runtime + m.setup + m.idle + m.downtime;
                    const cost = Math.round(totalHrs * m.costPerHr);
                    return (
                      <TableRow key={m.id} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell className="font-medium text-white">{m.station}</TableCell>
                        <TableCell className="text-center text-green-400">{hrs(m.runtime)}</TableCell>
                        <TableCell className="text-center text-yellow-400">{hrs(m.setup)}</TableCell>
                        <TableCell className="text-center text-red-300">{hrs(m.idle + m.downtime)}</TableCell>
                        <TableCell className="text-center font-bold text-white">{hrs(totalHrs)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress value={m.util} className={`h-2 w-14 ${utilBg(m.util)}`} />
                            <span className={`text-sm font-bold ${utilColor(m.util)}`}>{m.util.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-left text-amber-300 font-mono">{fmt(cost)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-gray-700 bg-gray-800/60 font-bold">
                    <TableCell className="text-white">סה״כ</TableCell>
                    <TableCell className="text-center text-green-400">{hrs(machineLog.reduce((s, m) => s + m.runtime, 0))}</TableCell>
                    <TableCell className="text-center text-yellow-400">{hrs(machineLog.reduce((s, m) => s + m.setup, 0))}</TableCell>
                    <TableCell className="text-center text-red-300">{hrs(machineLog.reduce((s, m) => s + m.idle + m.downtime, 0))}</TableCell>
                    <TableCell className="text-center text-white">{hrs(machineLog.reduce((s, m) => s + m.runtime + m.setup + m.idle + m.downtime, 0))}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={`${avgMachineUtil >= 75 ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}`}>ממוצע {avgMachineUtil}%</Badge>
                    </TableCell>
                    <TableCell className="text-left text-amber-300 font-mono">
                      {fmt(machineLog.reduce((s, m) => s + Math.round((m.runtime + m.setup + m.idle + m.downtime) * m.costPerHr), 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: עלויות ── */}
        <TabsContent value="costs">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-5 w-5 text-amber-400" />
                <h3 className="text-lg font-semibold text-white">הקצאת עלויות לפי הזמנה / פרויקט</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">הזמנה</TableHead>
                    <TableHead className="text-gray-400 text-right">פרויקט / מוצר</TableHead>
                    <TableHead className="text-gray-400 text-center">שעות עובד</TableHead>
                    <TableHead className="text-gray-400 text-center">עלות עובד ₪</TableHead>
                    <TableHead className="text-gray-400 text-center">שעות מכונה</TableHead>
                    <TableHead className="text-gray-400 text-center">עלות מכונה ₪</TableHead>
                    <TableHead className="text-gray-400 text-center">סה״כ ₪</TableHead>
                    <TableHead className="text-gray-400 text-center">חלוקה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costAllocation.map(c => {
                    const laborPct = Math.round((c.laborCost / c.totalCost) * 100);
                    return (
                      <TableRow key={c.job} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell>
                          <Badge className="bg-blue-500/20 text-blue-300 text-xs">{c.job}</Badge>
                        </TableCell>
                        <TableCell className="font-medium text-white">{c.project}</TableCell>
                        <TableCell className="text-center text-gray-200">{hrs(c.laborHrs)}</TableCell>
                        <TableCell className="text-center text-cyan-300 font-mono">{fmt(c.laborCost)}</TableCell>
                        <TableCell className="text-center text-gray-200">{hrs(c.machineHrs)}</TableCell>
                        <TableCell className="text-center text-purple-300 font-mono">{fmt(c.machineCost)}</TableCell>
                        <TableCell className="text-center font-bold text-amber-300 font-mono">{fmt(c.totalCost)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-1 justify-center">
                            <div className="w-20 h-2 rounded-full bg-gray-700 overflow-hidden flex">
                              <div className="h-full bg-cyan-500" style={{ width: `${laborPct}%` }} />
                              <div className="h-full bg-purple-500" style={{ width: `${100 - laborPct}%` }} />
                            </div>
                            <span className="text-[10px] text-gray-500">{laborPct}/{100 - laborPct}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-gray-700 bg-gray-800/60 font-bold">
                    <TableCell className="text-white" colSpan={2}>סה״כ</TableCell>
                    <TableCell className="text-center text-white">{hrs(costAllocation.reduce((s, c) => s + c.laborHrs, 0))}</TableCell>
                    <TableCell className="text-center text-cyan-300 font-mono">{fmt(costAllocation.reduce((s, c) => s + c.laborCost, 0))}</TableCell>
                    <TableCell className="text-center text-white">{hrs(costAllocation.reduce((s, c) => s + c.machineHrs, 0))}</TableCell>
                    <TableCell className="text-center text-purple-300 font-mono">{fmt(costAllocation.reduce((s, c) => s + c.machineCost, 0))}</TableCell>
                    <TableCell className="text-center text-amber-300 font-mono">{fmt(costAllocation.reduce((s, c) => s + c.totalCost, 0))}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}