import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Cog, Factory, Gauge, Wrench, Package, Zap, Shield, Clock,
  Flame, Sparkles, PaintBucket, Layers, Box, AlertTriangle, CheckCircle
} from "lucide-react";

const fmt = (v: number) => `${v.toLocaleString("he-IL")} \u20AA`;

const FALLBACK_WORK_CENTERS = [
  { id: "WC-01", key: "raw_material_cutting", name: "חיתוך חומר גלם", icon: Zap, stations: 2, load: 78, activeJobs: 3, oee: 86.2, color: "text-blue-400", bg: "bg-blue-500" },
  { id: "WC-02", key: "welding", name: "ריתוך", icon: Flame, stations: 2, load: 92, activeJobs: 4, oee: 81.5, color: "text-orange-400", bg: "bg-orange-500" },
  { id: "WC-03", key: "grinding", name: "השחזה וליטוש", icon: Sparkles, stations: 2, load: 65, activeJobs: 2, oee: 88.0, color: "text-purple-400", bg: "bg-purple-500" },
  { id: "WC-04", key: "aluminum_fabrication", name: "עיבוד אלומיניום", icon: Layers, stations: 2, load: 85, activeJobs: 3, oee: 83.7, color: "text-cyan-400", bg: "bg-cyan-500" },
  { id: "WC-05", key: "glass_preparation", name: "הכנת זכוכית", icon: Shield, stations: 1, load: 70, activeJobs: 2, oee: 90.1, color: "text-teal-400", bg: "bg-teal-500" },
  { id: "WC-06", key: "paint_and_finish", name: "צביעה וגימור", icon: PaintBucket, stations: 2, load: 58, activeJobs: 1, oee: 91.4, color: "text-pink-400", bg: "bg-pink-500" },
  { id: "WC-07", key: "assembly", name: "הרכבה", icon: Package, stations: 2, load: 88, activeJobs: 5, oee: 79.8, color: "text-amber-400", bg: "bg-amber-500" },
  { id: "WC-08", key: "packaging", name: "אריזה ומשלוח", icon: Box, stations: 1, load: 45, activeJobs: 2, oee: 93.6, color: "text-emerald-400", bg: "bg-emerald-500" },
];

type StationStatus = "active" | "maintenance" | "idle";
type MaintenanceStatus = "ok" | "due_soon" | "overdue";

interface Station {
  station_code: string;
  station_name: string;
  work_center_id: string;
  station_type: string;
  capacity_hours_day: number;
  setup_time_min: number;
  cycle_time_ref: string;
  labor_cost_hr: number;
  machine_cost_hr: number;
  active_status: StationStatus;
  maintenance_status: MaintenanceStatus;
}

const FALLBACK_STATIONS: Station[] = [
  { station_code: "STN-101", station_name: "מסור סרט אוטומטי", work_center_id: "WC-01", station_type: "CNC", capacity_hours_day: 16, setup_time_min: 20, cycle_time_ref: "4.5 דקות/יחידה", labor_cost_hr: 85, machine_cost_hr: 120, active_status: "active", maintenance_status: "ok" },
  { station_code: "STN-102", station_name: "חותך פלזמה", work_center_id: "WC-01", station_type: "אוטומטי", capacity_hours_day: 16, setup_time_min: 15, cycle_time_ref: "3.2 דקות/יחידה", labor_cost_hr: 90, machine_cost_hr: 150, active_status: "active", maintenance_status: "due_soon" },
  { station_code: "STN-201", station_name: "ריתוך MIG/MAG", work_center_id: "WC-02", station_type: "ידני", capacity_hours_day: 14, setup_time_min: 10, cycle_time_ref: "8.0 דקות/יחידה", labor_cost_hr: 110, machine_cost_hr: 45, active_status: "active", maintenance_status: "ok" },
  { station_code: "STN-202", station_name: "ריתוך TIG רובוטי", work_center_id: "WC-02", station_type: "רובוטי", capacity_hours_day: 20, setup_time_min: 30, cycle_time_ref: "5.5 דקות/יחידה", labor_cost_hr: 70, machine_cost_hr: 200, active_status: "active", maintenance_status: "ok" },
  { station_code: "STN-301", station_name: "משחזת שטוחה", work_center_id: "WC-03", station_type: "ידני", capacity_hours_day: 14, setup_time_min: 10, cycle_time_ref: "6.0 דקות/יחידה", labor_cost_hr: 80, machine_cost_hr: 55, active_status: "active", maintenance_status: "ok" },
  { station_code: "STN-302", station_name: "מלטשת סרט", work_center_id: "WC-03", station_type: "חצי-אוטומטי", capacity_hours_day: 14, setup_time_min: 8, cycle_time_ref: "3.0 דקות/יחידה", labor_cost_hr: 75, machine_cost_hr: 40, active_status: "maintenance", maintenance_status: "overdue" },
  { station_code: "STN-401", station_name: "מכונת CNC אלומיניום", work_center_id: "WC-04", station_type: "CNC", capacity_hours_day: 18, setup_time_min: 25, cycle_time_ref: "7.0 דקות/יחידה", labor_cost_hr: 95, machine_cost_hr: 180, active_status: "active", maintenance_status: "ok" },
  { station_code: "STN-402", station_name: "מכופף פרופילים", work_center_id: "WC-04", station_type: "אוטומטי", capacity_hours_day: 16, setup_time_min: 15, cycle_time_ref: "2.5 דקות/יחידה", labor_cost_hr: 80, machine_cost_hr: 95, active_status: "active", maintenance_status: "due_soon" },
  { station_code: "STN-501", station_name: "שולחן חיתוך זכוכית", work_center_id: "WC-05", station_type: "חצי-אוטומטי", capacity_hours_day: 14, setup_time_min: 12, cycle_time_ref: "5.0 דקות/יחידה", labor_cost_hr: 100, machine_cost_hr: 130, active_status: "active", maintenance_status: "ok" },
  { station_code: "STN-601", station_name: "תא ריסוס אלקטרוסטטי", work_center_id: "WC-06", station_type: "אוטומטי", capacity_hours_day: 16, setup_time_min: 35, cycle_time_ref: "2.0 דקות/יחידה", labor_cost_hr: 75, machine_cost_hr: 110, active_status: "active", maintenance_status: "ok" },
  { station_code: "STN-602", station_name: "תנור ייבוש/אפייה", work_center_id: "WC-06", station_type: "אוטומטי", capacity_hours_day: 20, setup_time_min: 45, cycle_time_ref: "1.5 דקות/יחידה", labor_cost_hr: 50, machine_cost_hr: 90, active_status: "idle", maintenance_status: "ok" },
  { station_code: "STN-701", station_name: "עמדת הרכבה ראשית", work_center_id: "WC-07", station_type: "ידני", capacity_hours_day: 16, setup_time_min: 5, cycle_time_ref: "12.0 דקות/יחידה", labor_cost_hr: 95, machine_cost_hr: 20, active_status: "active", maintenance_status: "ok" },
  { station_code: "STN-702", station_name: "עמדת הרכבת זכוכית", work_center_id: "WC-07", station_type: "ידני", capacity_hours_day: 14, setup_time_min: 8, cycle_time_ref: "15.0 דקות/יחידה", labor_cost_hr: 105, machine_cost_hr: 15, active_status: "active", maintenance_status: "due_soon" },
  { station_code: "STN-801", station_name: "קו אריזה אוטומטי", work_center_id: "WC-08", station_type: "אוטומטי", capacity_hours_day: 16, setup_time_min: 10, cycle_time_ref: "1.8 דקות/יחידה", labor_cost_hr: 60, machine_cost_hr: 75, active_status: "active", maintenance_status: "ok" },
];

const FALLBACK_MAINTENANCE = [
  { station: "STN-302", name: "מלטשת סרט", type: "תחזוקה מונעת", date: "2026-04-02", status: "overdue", notes: "החלפת סרט שחיקה + כיול מנוע", tech: "עומר חדד" },
  { station: "STN-102", name: "חותך פלזמה", type: "בדיקת שגרה", date: "2026-04-12", status: "due_soon", notes: "בדיקת ראש חיתוך + מערכת קירור", tech: "דוד מזרחי" },
  { station: "STN-402", name: "מכופף פרופילים", type: "תחזוקה מונעת", date: "2026-04-14", status: "due_soon", notes: "שימון מסילות + בדיקת לחץ הידראולי", tech: "אלון גולדשטיין" },
  { station: "STN-702", name: "עמדת הרכבת זכוכית", type: "כיול", date: "2026-04-15", status: "due_soon", notes: "כיול ואקום + בדיקת אטימות", tech: "שרה לוי" },
  { station: "STN-201", name: "ריתוך MIG/MAG", type: "בדיקת שגרה", date: "2026-04-20", status: "scheduled", notes: "בדיקת מזין חוט + ניקוי מזרק", tech: "יוסי כהן" },
  { station: "STN-401", name: "מכונת CNC אלומיניום", type: "תחזוקה מונעת", date: "2026-04-25", status: "scheduled", notes: "החלפת סכיני חיתוך + שמן קירור", tech: "דוד מזרחי" },
];

const statusBadge = (s: StationStatus) => {
  const map: Record<StationStatus, { label: string; cls: string }> = {
    active: { label: "פעיל", cls: "bg-emerald-500/20 text-emerald-300" },
    maintenance: { label: "בתחזוקה", cls: "bg-amber-500/20 text-amber-300" },
    idle: { label: "לא פעיל", cls: "bg-gray-500/20 text-gray-300" },
  };
  return map[s];
};

const maintBadge = (s: MaintenanceStatus) => {
  const map: Record<MaintenanceStatus, { label: string; cls: string }> = {
    ok: { label: "תקין", cls: "bg-emerald-500/20 text-emerald-300" },
    due_soon: { label: "קרוב", cls: "bg-amber-500/20 text-amber-300" },
    overdue: { label: "באיחור", cls: "bg-red-500/20 text-red-300" },
  };
  return map[s];
};

const schedBadge = (s: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    overdue: { label: "באיחור", cls: "bg-red-500/20 text-red-300" },
    due_soon: { label: "קרוב", cls: "bg-amber-500/20 text-amber-300" },
    scheduled: { label: "מתוכנן", cls: "bg-blue-500/20 text-blue-300" },
  };
  return map[s] || { label: s, cls: "bg-gray-500/20 text-gray-300" };
};

const oeeColor = (v: number) => v >= 85 ? "text-emerald-400" : v >= 75 ? "text-amber-400" : "text-red-400";
const oeeBg = (v: number) => v >= 85 ? "bg-emerald-500" : v >= 75 ? "bg-amber-500" : "bg-red-500";
const loadColor = (v: number) => v >= 85 ? "[&>div]:bg-red-500" : v >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500";

export default function WorkStations() {
  const [tab, setTab] = useState("centers");

  const { data: apiData } = useQuery({
    queryKey: ["production-work-stations"],
    queryFn: () => authFetch("/api/production/machines").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const workCenters = safeArr(apiData?.workCenters).length > 0 ? safeArr(apiData.workCenters) : FALLBACK_WORK_CENTERS;
  const stations: Station[] = safeArr(apiData?.stations).length > 0 ? safeArr(apiData.stations) : FALLBACK_STATIONS;
  const maintenanceSchedule = safeArr(apiData?.maintenance).length > 0 ? safeArr(apiData.maintenance) : FALLBACK_MAINTENANCE;

  const centerName = (id: string) => workCenters.find((c: any) => c.id === id)?.name || id;
  const totalStations = stations.length;
  const activeCount = stations.filter((s: any) => s.active_status === "active").length;
  const maintCount = stations.filter((s: any) => s.active_status === "maintenance").length;
  const avgOee = (workCenters.reduce((a: number, c: any) => a + c.oee, 0) / workCenters.length).toFixed(1);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Cog className="h-7 w-7 text-primary" /> מרכזי עבודה ותחנות
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            טכנו-כל עוזי | {totalStations} תחנות | {activeCount} פעילות | OEE ממוצע: {avgOee}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/20 text-emerald-300 text-xs">{activeCount} פעילות</Badge>
          <Badge className="bg-amber-500/20 text-amber-300 text-xs">{maintCount} בתחזוקה</Badge>
          <Badge className="bg-gray-500/20 text-gray-300 text-xs">{totalStations - activeCount - maintCount} לא פעילות</Badge>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "סה\"כ תחנות", value: String(totalStations), icon: Factory, color: "text-blue-400", bg: "bg-blue-950/40" },
          { label: "תחנות פעילות", value: String(activeCount), icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-950/40" },
          { label: "OEE ממוצע", value: `${avgOee}%`, icon: Gauge, color: "text-purple-400", bg: "bg-purple-950/40" },
          { label: "תחזוקה ממתינה", value: String(maintenanceSchedule.filter(m => m.status !== "scheduled").length), icon: Wrench, color: "text-amber-400", bg: "bg-amber-950/40" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-0 shadow-sm`}>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <Icon className={`h-8 w-8 ${kpi.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className={`text-2xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="centers" className="text-xs gap-1"><Factory className="h-3.5 w-3.5" /> מרכזי עבודה</TabsTrigger>
          <TabsTrigger value="stations" className="text-xs gap-1"><Cog className="h-3.5 w-3.5" /> תחנות</TabsTrigger>
          <TabsTrigger value="loads" className="text-xs gap-1"><Gauge className="h-3.5 w-3.5" /> עומסים</TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" /> תחזוקה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Work Centers Cards */}
        <TabsContent value="centers">
          <div className="grid grid-cols-4 gap-4">
            {workCenters.map(wc => {
              const Icon = wc.icon;
              const wcStations = stations.filter(s => s.work_center_id === wc.id);
              return (
                <Card key={wc.id} className={`border-0 shadow-md hover:shadow-lg transition-shadow ${wc.oee < 80 ? "ring-1 ring-amber-500/30" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${wc.color}`} />
                        {wc.name}
                      </CardTitle>
                      <Badge className="text-[9px] bg-muted/60">{wc.id}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* OEE Score */}
                    <div className="text-center">
                      <span className={`text-3xl font-bold font-mono ${oeeColor(wc.oee)}`}>{wc.oee}%</span>
                      <span className="text-[10px] text-muted-foreground block">OEE</span>
                    </div>
                    <Progress value={wc.oee} className={`h-1.5 ${wc.oee >= 85 ? "[&>div]:bg-emerald-500" : wc.oee >= 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`} />

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-1 text-[10px] text-center">
                      <div>
                        <p className="text-muted-foreground">תחנות</p>
                        <p className="font-mono font-bold">{wc.stations}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">עומס</p>
                        <p className={`font-mono font-bold ${wc.load >= 85 ? "text-red-400" : wc.load >= 60 ? "text-amber-400" : "text-emerald-400"}`}>{wc.load}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">עבודות</p>
                        <p className="font-mono font-bold">{wc.activeJobs}</p>
                      </div>
                    </div>

                    {/* Station status pills */}
                    <div className="flex gap-1 flex-wrap">
                      {wcStations.map(s => {
                        const sb = statusBadge(s.active_status);
                        return (
                          <Badge key={s.station_code} className={`text-[8px] ${sb.cls}`}>
                            {s.station_code} - {sb.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 2: All Stations Table */}
        <TabsContent value="stations">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">קוד תחנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שם תחנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מרכז עבודה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">קיבולת שעות/יום</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">זמן Setup</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Cycle Time</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עלות עבודה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עלות מכונה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תחזוקה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stations.map(s => {
                    const sb = statusBadge(s.active_status);
                    const mb = maintBadge(s.maintenance_status);
                    return (
                      <TableRow key={s.station_code} className={s.active_status === "maintenance" ? "bg-amber-950/10" : s.active_status === "idle" ? "bg-gray-950/10" : ""}>
                        <TableCell className="font-mono text-[10px] font-bold">{s.station_code}</TableCell>
                        <TableCell className="text-xs font-medium">{s.station_name}</TableCell>
                        <TableCell className="text-[10px]">{centerName(s.work_center_id)}</TableCell>
                        <TableCell className="text-[10px]">
                          <Badge className="text-[8px] bg-muted/60">{s.station_type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-center">{s.capacity_hours_day}</TableCell>
                        <TableCell className="font-mono text-[10px] text-center">{s.setup_time_min} דק׳</TableCell>
                        <TableCell className="text-[10px]">{s.cycle_time_ref}</TableCell>
                        <TableCell className="font-mono text-[10px]">{fmt(s.labor_cost_hr)}/שעה</TableCell>
                        <TableCell className="font-mono text-[10px]">{fmt(s.machine_cost_hr)}/שעה</TableCell>
                        <TableCell><Badge className={`text-[8px] ${sb.cls}`}>{sb.label}</Badge></TableCell>
                        <TableCell><Badge className={`text-[8px] ${mb.cls}`}>{mb.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Load per Station */}
        <TabsContent value="loads">
          <div className="space-y-4">
            {workCenters.map(wc => {
              const Icon = wc.icon;
              const wcStations = stations.filter(s => s.work_center_id === wc.id);
              return (
                <Card key={wc.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${wc.color}`} />
                      {wc.name}
                      <Badge className="text-[9px] bg-muted/60 mr-2">{wc.load}% עומס כולל</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {wcStations.map(s => {
                      const stationLoad = Math.min(100, Math.round(wc.load + (Math.random() * 20 - 10)));
                      const usedHours = ((s.capacity_hours_day * stationLoad) / 100).toFixed(1);
                      return (
                        <div key={s.station_code} className="flex items-center gap-3">
                          <div className="w-28 text-[10px] font-mono font-bold shrink-0">{s.station_code}</div>
                          <div className="w-40 text-xs truncate shrink-0">{s.station_name}</div>
                          <div className="flex-1">
                            <Progress value={stationLoad} className={`h-3 ${loadColor(stationLoad)}`} />
                          </div>
                          <div className="w-16 text-[10px] font-mono text-left shrink-0">
                            <span className={stationLoad >= 85 ? "text-red-400" : stationLoad >= 60 ? "text-amber-400" : "text-emerald-400"}>
                              {stationLoad}%
                            </span>
                          </div>
                          <div className="w-24 text-[10px] text-muted-foreground shrink-0">{usedHours}/{s.capacity_hours_day} שעות</div>
                          <Badge className={`text-[8px] shrink-0 ${statusBadge(s.active_status).cls}`}>
                            {statusBadge(s.active_status).label}
                          </Badge>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 4: Maintenance Schedule */}
        <TabsContent value="maintenance">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card className="bg-red-950/20 border-0">
              <CardContent className="pt-4 text-center">
                <AlertTriangle className="h-5 w-5 mx-auto text-red-400 mb-1" />
                <p className="text-xs text-red-300">באיחור</p>
                <p className="text-2xl font-bold font-mono text-red-400">{maintenanceSchedule.filter(m => m.status === "overdue").length}</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-950/20 border-0">
              <CardContent className="pt-4 text-center">
                <Clock className="h-5 w-5 mx-auto text-amber-400 mb-1" />
                <p className="text-xs text-amber-300">קרוב</p>
                <p className="text-2xl font-bold font-mono text-amber-400">{maintenanceSchedule.filter(m => m.status === "due_soon").length}</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-950/20 border-0">
              <CardContent className="pt-4 text-center">
                <CheckCircle className="h-5 w-5 mx-auto text-blue-400 mb-1" />
                <p className="text-xs text-blue-300">מתוכנן</p>
                <p className="text-2xl font-bold font-mono text-blue-400">{maintenanceSchedule.filter(m => m.status === "scheduled").length}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">תחנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שם</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג תחזוקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הערות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">טכנאי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenanceSchedule.map((m, i) => {
                    const sb = schedBadge(m.status);
                    return (
                      <TableRow key={i} className={m.status === "overdue" ? "bg-red-950/10" : ""}>
                        <TableCell className="font-mono text-[10px] font-bold">{m.station}</TableCell>
                        <TableCell className="text-xs">{m.name}</TableCell>
                        <TableCell className="text-[10px]">{m.type}</TableCell>
                        <TableCell className="font-mono text-[10px]">{m.date}</TableCell>
                        <TableCell><Badge className={`text-[8px] ${sb.cls}`}>{sb.label}</Badge></TableCell>
                        <TableCell className="text-[10px] max-w-[200px] truncate">{m.notes}</TableCell>
                        <TableCell className="text-[10px]">{m.tech}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
