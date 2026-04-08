import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Truck, Users, MapPin, Fuel, Wrench, Clock, Package, CheckCircle2,
  AlertTriangle, TrendingUp, TrendingDown, Navigation, Eye, BarChart3,
  DollarSign, Calendar, CircleDot, ArrowLeftRight, Gauge
} from "lucide-react";

/* ── helpers & maps ────────────────────────────────────────── */
const nis = (v: number) => `₪${v.toLocaleString("he-IL")}`;
type VehicleStatus = "בנסיעה" | "ממתין" | "פריקה" | "חזרה" | "במפעל";
type DeliveryType = "משלוח" | "התקנה" | "איסוף";
type ScheduleStatus = "הושלם" | "בדרך" | "ממתין" | "מתוכנן" | "בעיכוב";
const vehicleStatusCls: Record<VehicleStatus, string> = {
  "בנסיעה": "bg-blue-500/20 text-blue-400", "ממתין": "bg-amber-500/20 text-amber-400",
  "פריקה": "bg-purple-500/20 text-purple-400", "חזרה": "bg-cyan-500/20 text-cyan-400",
  "במפעל": "bg-gray-500/20 text-gray-400",
};
const scheduleStatusCls: Record<ScheduleStatus, string> = {
  "הושלם": "bg-emerald-500/20 text-emerald-400", "בדרך": "bg-blue-500/20 text-blue-400",
  "ממתין": "bg-amber-500/20 text-amber-400", "מתוכנן": "bg-gray-500/20 text-gray-400",
  "בעיכוב": "bg-red-500/20 text-red-400",
};
const deliveryTypeCls: Record<DeliveryType, string> = {
  "משלוח": "bg-blue-500/20 text-blue-400", "התקנה": "bg-emerald-500/20 text-emerald-400",
  "איסוף": "bg-purple-500/20 text-purple-400",
};

/* ── static data: live vehicles ───────────────────────────── */
interface LiveVehicle { plate: string; driver: string; location: string; destination: string; eta: string; status: VehicleStatus; cargo: string; }
const FALLBACK_LIVE_VEHICLES: LiveVehicle[] = [
  { plate: "782-34-191", driver: "מאיר אוחנה", location: "כביש 6 — גשר הקישון", destination: "חיפה — נמל", eta: "09:25", status: "בנסיעה", cargo: "קורות פלדה 8 טון" },
  { plate: "551-18-207", driver: "דוד לוי", location: "אזור תעשייה אשדוד", destination: "לקוח — מגדלי הים", eta: "08:40", status: "פריקה", cargo: "עמודי בטון ומעקות" },
  { plate: "319-90-442", driver: "יוסי כהן", location: "רחוב הרצל, נתניה", destination: "קניון השרון", eta: "10:05", status: "בנסיעה", cargo: "חלונות אלומיניום" },
  { plate: "624-57-333", driver: "אבי מזרחי", location: "צומת שורק — כביש 3", destination: "באר שבע — שכונת הפארק", eta: "11:30", status: "בנסיעה", cargo: "גדרות ושערים מתכת" },
  { plate: "448-76-115", driver: "חיים פרץ", location: "מפעל טכנו-כל — אשדוד", destination: "ראשון לציון — בית ספר אורט", eta: "—", status: "ממתין", cargo: "מעקות נירוסטה" },
  { plate: "192-03-668", driver: "רון ביטון", location: "רמלה — מחלף דרום", destination: "חזרה למפעל", eta: "12:15", status: "חזרה", cargo: "ריק — חזרה מפריקה" },
  { plate: "876-54-222", driver: "—", location: "מפעל טכנו-כל — אשדוד", destination: "—", eta: "—", status: "במפעל", cargo: "—" },
  { plate: "935-12-440", driver: "עמית שושן", location: "מפעל טכנו-כל — מוסך", destination: "—", eta: "—", status: "במפעל", cargo: "בתחזוקה שוטפת" },
];
/* ── static data: today's FALLBACK_SCHEDULE ────────────────────────── */
interface ScheduleEntry { time: string; vehicle: string; driver: string; destination: string; type: DeliveryType; status: ScheduleStatus; }
const FALLBACK_SCHEDULE: ScheduleEntry[] = [
  { time: "06:30", vehicle: "551-18-207", driver: "דוד לוי", destination: "אשדוד — מגדלי הים", type: "משלוח", status: "הושלם" },
  { time: "07:00", vehicle: "782-34-191", driver: "מאיר אוחנה", destination: "חיפה — נמל", type: "משלוח", status: "בדרך" },
  { time: "07:45", vehicle: "319-90-442", driver: "יוסי כהן", destination: "נתניה — קניון השרון", type: "התקנה", status: "בדרך" },
  { time: "08:00", vehicle: "624-57-333", driver: "אבי מזרחי", destination: "באר שבע — שכונת הפארק", type: "משלוח", status: "בדרך" },
  { time: "09:30", vehicle: "448-76-115", driver: "חיים פרץ", destination: "ראשון לציון — בית ספר אורט", type: "התקנה", status: "ממתין" },
  { time: "11:00", vehicle: "192-03-668", driver: "רון ביטון", destination: "פתח תקווה — מפעל טמפו", type: "איסוף", status: "מתוכנן" },
  { time: "13:00", vehicle: "782-34-191", driver: "מאיר אוחנה", destination: "קיסריה — גשר כביש 6", type: "משלוח", status: "מתוכנן" },
  { time: "14:30", vehicle: "551-18-207", driver: "דוד לוי", destination: "אשדוד — נמל רציף 4", type: "איסוף", status: "מתוכנן" },
];
/* ── static data: vehicle FALLBACK_PERFORMANCE ─────────────────────── */
interface VehiclePerformance { plate: string; type: string; kmToday: number; kmMonth: number; fuelPerKm: number; efficiency: number; trips: number; }
const FALLBACK_PERFORMANCE: VehiclePerformance[] = [
  { plate: "782-34-191", type: "משאית", kmToday: 125, kmMonth: 2850, fuelPerKm: 0.38, efficiency: 92, trips: 48 },
  { plate: "551-18-207", type: "מנוף", kmToday: 45, kmMonth: 980, fuelPerKm: 0.52, efficiency: 85, trips: 22 },
  { plate: "319-90-442", type: "טנדר", kmToday: 78, kmMonth: 1620, fuelPerKm: 0.18, efficiency: 96, trips: 55 },
  { plate: "624-57-333", type: "משאית", kmToday: 110, kmMonth: 2400, fuelPerKm: 0.35, efficiency: 88, trips: 42 },
  { plate: "448-76-115", type: "טנדר", kmToday: 0, kmMonth: 1450, fuelPerKm: 0.17, efficiency: 94, trips: 51 },
  { plate: "192-03-668", type: "משאית", kmToday: 62, kmMonth: 1900, fuelPerKm: 0.40, efficiency: 82, trips: 35 },
  { plate: "876-54-222", type: "מנוף", kmToday: 0, kmMonth: 650, fuelPerKm: 0.55, efficiency: 78, trips: 14 },
  { plate: "935-12-440", type: "משאית", kmToday: 0, kmMonth: 2100, fuelPerKm: 0.36, efficiency: 90, trips: 38 },
];
/* ── static data: FALLBACK_MAINTENANCE ─────────────────────────────── */
interface Maintenance { plate: string; type: string; service: string; dueDate: string; kmUntil: number; urgency: string; }
const FALLBACK_MAINTENANCE: Maintenance[] = [
  { plate: "935-12-440", type: "משאית", service: "טיפול 50,000 ק\"מ — שמן + פילטרים", dueDate: "08/04/2026", kmUntil: 120, urgency: "דחוף" },
  { plate: "876-54-222", type: "מנוף", service: "בדיקת מערכת הידראולית שנתית", dueDate: "15/04/2026", kmUntil: 480, urgency: "בינוני" },
  { plate: "624-57-333", type: "משאית", service: "החלפת צמיגים — ציר אחורי", dueDate: "22/04/2026", kmUntil: 1200, urgency: "רגיל" },
];
const urgencyCls: Record<string, string> = {
  "דחוף": "bg-red-500/20 text-red-400", "בינוני": "bg-amber-500/20 text-amber-400",
  "רגיל": "bg-emerald-500/20 text-emerald-400",
};
/* ── static data: monthly costs ───────────────────────────── */
interface CostLine { category: string; amount: number; pct: number; trend: string; up: boolean; }
const FALLBACK_MONTHLY_COSTS: CostLine[] = [
  { category: "דלק", amount: 18500, pct: 38, trend: "+3.2%", up: false },
  { category: "שכר נהגים", amount: 14200, pct: 29, trend: "יציב", up: true },
  { category: "תחזוקה ותיקונים", amount: 7800, pct: 16, trend: "-8.5%", up: true },
  { category: "ביטוח צי", amount: 4200, pct: 9, trend: "יציב", up: true },
  { category: "אגרות ורישיונות", amount: 2100, pct: 4, trend: "יציב", up: true },
  { category: "שונות (חניה, כבישי אגרה)", amount: 1900, pct: 4, trend: "+1.1%", up: false },
];

/* ══════════════════════════════════════════════════════════════ */
export default function FleetCommandCenter() {
  const { data: liveVehicles = FALLBACK_LIVE_VEHICLES } = useQuery({
    queryKey: ["logistics-live-vehicles"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/fleet-command-center/live-vehicles");
      if (!res.ok) return FALLBACK_LIVE_VEHICLES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_LIVE_VEHICLES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: schedule = FALLBACK_SCHEDULE } = useQuery({
    queryKey: ["logistics-schedule"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/fleet-command-center/schedule");
      if (!res.ok) return FALLBACK_SCHEDULE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SCHEDULE;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: performance = FALLBACK_PERFORMANCE } = useQuery({
    queryKey: ["logistics-performance"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/fleet-command-center/performance");
      if (!res.ok) return FALLBACK_PERFORMANCE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PERFORMANCE;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: maintenance = FALLBACK_MAINTENANCE } = useQuery({
    queryKey: ["logistics-maintenance"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/fleet-command-center/maintenance");
      if (!res.ok) return FALLBACK_MAINTENANCE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MAINTENANCE;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: monthlyCosts = FALLBACK_MONTHLY_COSTS } = useQuery({
    queryKey: ["logistics-monthly-costs"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/fleet-command-center/monthly-costs");
      if (!res.ok) return FALLBACK_MONTHLY_COSTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MONTHLY_COSTS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [activeTab, setActiveTab] = useState("live");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-7 w-7 text-blue-400" /> מרכז פיקוד צי רכב
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — מעקב חי, ביצועים, תחזוקה ועלויות צי הרכב
        </p>
      </div>

      {/* ── KPI Cards (8) ──────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "כלי רכב פעילים", value: "8", color: "text-blue-400", icon: Truck, trend: "מתוך 8", up: true },
          { label: "בדרך כרגע", value: "5", color: "text-cyan-400", icon: Navigation, trend: "3 משלוחים + 1 חזרה + 1 התקנה", up: true },
          { label: "במפעל", value: "2", color: "text-gray-400", icon: MapPin, trend: "1 ממתין + 1 תחזוקה", up: true },
          { label: "בתחזוקה", value: "1", color: "text-amber-400", icon: Wrench, trend: "טיפול שוטף", up: false },
          { label: "נהגים פעילים", value: "7", color: "text-emerald-400", icon: Users, trend: "+1 מאתמול", up: true },
          { label: "משלוחים היום", value: "6", color: "text-purple-400", icon: Package, trend: "1 הושלם", up: true },
          { label: "קילומטרז' יומי", value: "420 ק\"מ", color: "text-orange-400", icon: Gauge, trend: "+12% מממוצע", up: true },
          { label: "עלות דלק חודשית", value: nis(18500), color: "text-red-400", icon: Fuel, trend: "+3.2%", up: false },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {kpi.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                      <span className={`text-[9px] ${kpi.up ? "text-emerald-400" : "text-red-400"}`}>{kpi.trend}</span>
                    </div>
                  </div>
                  <Icon className={`h-4 w-4 ${kpi.color} opacity-40`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Live Vehicle Map ───────────────────────────── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-green-400 animate-pulse" /> מפת רכבים חיה — {liveVehicles.length} כלי רכב
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-right text-xs">מספר רישוי</TableHead>
                  <TableHead className="text-right text-xs">נהג</TableHead>
                  <TableHead className="text-right text-xs">מיקום נוכחי</TableHead>
                  <TableHead className="text-right text-xs">יעד</TableHead>
                  <TableHead className="text-right text-xs">ETA</TableHead>
                  <TableHead className="text-right text-xs">סטטוס</TableHead>
                  <TableHead className="text-right text-xs">מטען</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveVehicles.map((v, i) => (
                  <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-mono text-sm font-semibold text-blue-400">{v.plate}</TableCell>
                    <TableCell className="text-sm">{v.driver}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{v.location}</span>
                    </TableCell>
                    <TableCell className="text-sm">{v.destination}</TableCell>
                    <TableCell className="text-sm font-mono">{v.eta}</TableCell>
                    <TableCell>
                      <Badge className={`${vehicleStatusCls[v.status]} text-[11px] border-0`}>{v.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">{v.cargo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Today's Schedule ───────────────────────────── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-400" /> לוח זמנים היום — {schedule.length} פעולות
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-right text-xs">שעה</TableHead>
                  <TableHead className="text-right text-xs">רכב</TableHead>
                  <TableHead className="text-right text-xs">נהג</TableHead>
                  <TableHead className="text-right text-xs">יעד</TableHead>
                  <TableHead className="text-right text-xs">סוג</TableHead>
                  <TableHead className="text-right text-xs">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((s, i) => (
                  <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-mono text-sm font-semibold">{s.time}</TableCell>
                    <TableCell className="font-mono text-xs text-blue-400">{s.vehicle}</TableCell>
                    <TableCell className="text-sm">{s.driver}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{s.destination}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${deliveryTypeCls[s.type]} text-[11px] border-0`}>{s.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${scheduleStatusCls[s.status]} text-[11px] border-0`}>{s.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="live" className="text-xs gap-1"><Eye className="h-3.5 w-3.5" /> סקירה חיה</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> ביצועים</TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" /> תחזוקה</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> עלויות</TabsTrigger>
        </TabsList>

        {/* ── Tab: Live Overview ────────────────────────── */}
        <TabsContent value="live">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CircleDot className="h-4 w-4 text-green-400 animate-pulse" /> סיכום סטטוס צי — כרגע
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {(Object.entries(vehicleStatusCls) as [VehicleStatus, string][]).map(([status, cls]) => (
                  <div key={status} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/50">
                    <Badge className={`${cls} text-xs border-0`}>{status}</Badge>
                    <span className="font-mono font-bold text-lg">{liveVehicles.filter(v => v.status === status).length}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {liveVehicles.filter(v => v.status === "בנסיעה").map((v, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <div>
                        <span className="font-mono text-sm font-semibold text-blue-400">{v.plate}</span>
                        <p className="text-[11px] text-muted-foreground">{v.driver}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-[11px] text-muted-foreground">{v.destination}</p>
                        <p className="text-xs font-mono text-emerald-400">ETA {v.eta}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Performance ─────────────────────────── */}
        <TabsContent value="performance">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-right text-xs">לוחית רישוי</TableHead>
                    <TableHead className="text-right text-xs">סוג</TableHead>
                    <TableHead className="text-right text-xs">ק"מ היום</TableHead>
                    <TableHead className="text-right text-xs">ק"מ חודשי</TableHead>
                    <TableHead className="text-right text-xs">₪/ק"מ דלק</TableHead>
                    <TableHead className="text-right text-xs">נסיעות החודש</TableHead>
                    <TableHead className="text-right text-xs">יעילות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performance.map((p, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-sm font-semibold text-blue-400">{p.plate}</TableCell>
                      <TableCell className="text-sm">{p.type}</TableCell>
                      <TableCell className="text-sm font-mono">{p.kmToday}</TableCell>
                      <TableCell className="text-sm font-mono">{p.kmMonth.toLocaleString("he-IL")}</TableCell>
                      <TableCell className="text-sm font-mono text-amber-400">{nis(p.fuelPerKm)}</TableCell>
                      <TableCell className="text-sm font-mono text-center">{p.trips}</TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <Progress value={p.efficiency} className="h-2 flex-1" />
                          <span className={`text-[11px] font-mono ${p.efficiency >= 90 ? "text-emerald-400" : p.efficiency >= 80 ? "text-amber-400" : "text-red-400"}`}>
                            {p.efficiency}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                <span className="text-sm font-semibold text-muted-foreground">סה"כ חודשי</span>
                <div className="flex items-center gap-6 text-sm">
                  <span>ק"מ: <strong className="text-blue-400 font-mono">{performance.reduce((s, p) => s + p.kmMonth, 0).toLocaleString("he-IL")}</strong></span>
                  <span>נסיעות: <strong className="text-purple-400 font-mono">{performance.reduce((s, p) => s + p.trips, 0)}</strong></span>
                  <span>ממוצע יעילות: <strong className="text-emerald-400 font-mono">{Math.round(performance.reduce((s, p) => s + p.efficiency, 0) / performance.length)}%</strong></span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Maintenance ─────────────────────────── */}
        <TabsContent value="maintenance">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-400" /> טיפולים קרובים — {maintenance.length} רכבים
              </h3>
              {maintenance.map((m, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/20 border border-border/50 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {m.urgency === "דחוף" ? <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
                      : m.urgency === "בינוני" ? <Clock className="h-5 w-5 text-amber-400 mt-0.5" />
                      : <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-blue-400">{m.plate}</span>
                        <span className="text-xs text-muted-foreground">({m.type})</span>
                        <Badge className={`${urgencyCls[m.urgency]} text-[11px] border-0`}>{m.urgency}</Badge>
                      </div>
                      <p className="text-sm mt-1">{m.service}</p>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {m.dueDate}</span>
                        <span className="flex items-center gap-1"><ArrowLeftRight className="h-3 w-3" /> נותרו {m.kmUntil} ק"מ</span>
                      </div>
                    </div>
                  </div>
                  <Progress value={m.kmUntil < 200 ? 95 : m.kmUntil < 500 ? 65 : 30} className="h-2 w-20 mt-2" />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Costs ───────────────────────────────── */}
        <TabsContent value="costs">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-right text-xs">קטגוריה</TableHead>
                    <TableHead className="text-right text-xs">סכום חודשי</TableHead>
                    <TableHead className="text-right text-xs">אחוז מסה"כ</TableHead>
                    <TableHead className="text-right text-xs">מגמה</TableHead>
                    <TableHead className="text-right text-xs">חלק יחסי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyCosts.map((c, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="text-sm font-semibold">{c.category}</TableCell>
                      <TableCell className="text-sm font-mono font-bold">{nis(c.amount)}</TableCell>
                      <TableCell className="text-sm font-mono text-center">{c.pct}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {c.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                          <span className={`text-xs ${c.up ? "text-emerald-400" : "text-red-400"}`}>{c.trend}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <Progress value={c.pct} className="h-2 flex-1" />
                          <span className="text-[10px] text-muted-foreground w-8">{c.pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                <span className="text-sm font-semibold text-muted-foreground">סה"כ עלות חודשית צי</span>
                <span className="text-lg font-bold font-mono">{nis(monthlyCosts.reduce((s, c) => s + c.amount, 0))}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
