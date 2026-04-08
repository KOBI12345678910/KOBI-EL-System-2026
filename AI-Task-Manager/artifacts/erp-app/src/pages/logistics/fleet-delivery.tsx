import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Truck, Users, MapPin, Fuel, Wrench, Clock, Package,
  CalendarCheck, Route, CreditCard, CheckCircle2, AlertTriangle,
  TrendingUp, TrendingDown, Navigation, Anchor, Timer
} from "lucide-react";

/* ── helpers ───────────────────────────────────────────────── */
const nis = (v: number) => `₪${v.toLocaleString("he-IL")}`;

type VehicleType = "משאית" | "טנדר" | "מנוף" | "נגרר";
type VehicleStatus = "פעיל" | "בטיפול" | "לא זמין" | "בדרך";
type DeliveryStatus = "נטען" | "בדרך" | "נמסר" | "עיכוב" | "ממתין";

const vehicleStatusCls: Record<VehicleStatus, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-400",
  "בטיפול": "bg-amber-500/20 text-amber-400",
  "לא זמין": "bg-gray-500/20 text-gray-400",
  "בדרך": "bg-blue-500/20 text-blue-400",
};

const deliveryStatusCls: Record<DeliveryStatus, string> = {
  "נטען": "bg-cyan-500/20 text-cyan-400",
  "בדרך": "bg-blue-500/20 text-blue-400",
  "נמסר": "bg-emerald-500/20 text-emerald-400",
  "עיכוב": "bg-red-500/20 text-red-400",
  "ממתין": "bg-gray-500/20 text-gray-400",
};

/* ── static data: vehicles ─────────────────────────────────── */
interface Vehicle {
  plate: string; type: VehicleType; status: VehicleStatus;
  driver: string; location: string; nextMaintenance: string;
}
const vehicles: Vehicle[] = [
  { plate: "78-342-91", type: "משאית", status: "בדרך", driver: "מאיר אוחנה", location: "כביש 6 — קיסריה", nextMaintenance: "22/04/2026" },
  { plate: "55-118-07", type: "מנוף", status: "פעיל", driver: "דוד לוי", location: "מפעל — אשדוד", nextMaintenance: "05/05/2026" },
  { plate: "31-990-42", type: "טנדר", status: "פעיל", driver: "יוסי כהן", location: "אזור תעשייה נתניה", nextMaintenance: "18/04/2026" },
  { plate: "62-457-33", type: "משאית", status: "בטיפול", driver: "—", location: "מוסך ראשל\"צ", nextMaintenance: "10/04/2026" },
  { plate: "44-876-15", type: "נגרר", status: "פעיל", driver: "אבי מזרחי", location: "באר שבע", nextMaintenance: "30/04/2026" },
  { plate: "19-203-68", type: "טנדר", status: "בדרך", driver: "חיים פרץ", location: "כביש 4 — ראשון לציון", nextMaintenance: "12/05/2026" },
  { plate: "87-654-22", type: "מנוף", status: "לא זמין", driver: "—", location: "חניון מפעל", nextMaintenance: "15/04/2026" },
  { plate: "93-512-40", type: "משאית", status: "פעיל", driver: "רון ביטון", location: "חיפה — נמל", nextMaintenance: "28/04/2026" },
];

/* ── static data: deliveries ───────────────────────────────── */
interface Delivery {
  id: string; project: string; destination: string; driver: string;
  vehicle: string; load: string; departure: string; eta: string;
  status: DeliveryStatus;
}
const deliveries: Delivery[] = [
  { id: "DLV-301", project: "פרויקט גשר הצפון", destination: "חיפה", driver: "מאיר אוחנה", vehicle: "78-342-91", load: "קורות פלדה 8 טון", departure: "07:00", eta: "09:30", status: "בדרך" },
  { id: "DLV-302", project: "מגדלי הים", destination: "אשדוד", driver: "דוד לוי", vehicle: "55-118-07", load: "מנוף + עמודים", departure: "06:30", eta: "08:00", status: "נמסר" },
  { id: "DLV-303", project: "קניון השרון", destination: "נתניה", driver: "יוסי כהן", vehicle: "31-990-42", load: "חלונות אלומיניום", departure: "08:15", eta: "10:00", status: "נטען" },
  { id: "DLV-304", project: "שכונת הפארק", destination: "באר שבע", driver: "אבי מזרחי", vehicle: "44-876-15", load: "גדרות + שערים", departure: "05:45", eta: "08:45", status: "בדרך" },
  { id: "DLV-305", project: "בית ספר אורט", destination: "ראשון לציון", driver: "חיים פרץ", vehicle: "19-203-68", load: "מעקות נירוסטה", departure: "09:00", eta: "10:15", status: "עיכוב" },
  { id: "DLV-306", project: "מפעל טמפו", destination: "נתניה", driver: "רון ביטון", vehicle: "93-512-40", load: "קונסטרוקציה 12 טון", departure: "10:30", eta: "12:30", status: "ממתין" },
  { id: "DLV-307", project: "גשר כביש 6", destination: "קיסריה", driver: "מאיר אוחנה", vehicle: "78-342-91", load: "פרופילים 6 טון", departure: "13:00", eta: "14:45", status: "ממתין" },
  { id: "DLV-308", project: "נמל אשדוד — רציף 4", destination: "אשדוד", driver: "דוד לוי", vehicle: "55-118-07", load: "הרמה + פריקה", departure: "11:00", eta: "13:00", status: "ממתין" },
];

/* ── static data: trip planning ────────────────────────────── */
interface Trip {
  route: string; stops: number; estimatedTime: string;
  loadWeight: string; vehicle: string; driver: string; status: string;
}
const trips: Trip[] = [
  { route: "אשדוד ➜ נתניה ➜ חיפה", stops: 3, estimatedTime: "4:30 שעות", loadWeight: "14 טון", vehicle: "78-342-91 (משאית)", driver: "מאיר אוחנה", status: "מאושר" },
  { route: "באר שבע ➜ ירושלים", stops: 2, estimatedTime: "2:15 שעות", loadWeight: "8 טון", vehicle: "44-876-15 (נגרר)", driver: "אבי מזרחי", status: "מתוכנן" },
  { route: "ראשון לציון ➜ תל אביב ➜ הרצליה", stops: 3, estimatedTime: "2:00 שעות", loadWeight: "3 טון", vehicle: "19-203-68 (טנדר)", driver: "חיים פרץ", status: "מאושר" },
  { route: "חיפה ➜ עכו ➜ נהריה", stops: 3, estimatedTime: "1:45 שעות", loadWeight: "10 טון", vehicle: "93-512-40 (משאית)", driver: "רון ביטון", status: "בביצוע" },
  { route: "נתניה ➜ כפר סבא ➜ פתח תקווה", stops: 3, estimatedTime: "1:30 שעות", loadWeight: "2.5 טון", vehicle: "31-990-42 (טנדר)", driver: "יוסי כהן", status: "מתוכנן" },
  { route: "אשדוד ➜ אשקלון ➜ שדרות", stops: 3, estimatedTime: "1:15 שעות", loadWeight: "6 טון", vehicle: "55-118-07 (מנוף)", driver: "דוד לוי", status: "מאושר" },
];

const tripStatusCls: Record<string, string> = {
  "מאושר": "bg-emerald-500/20 text-emerald-400",
  "מתוכנן": "bg-blue-500/20 text-blue-400",
  "בביצוע": "bg-amber-500/20 text-amber-400",
};

/* ── static data: costs ────────────────────────────────────── */
interface Cost {
  vehicle: string; plate: string; fuel: number; maintenance: number;
  driverCost: number; allocatedProject: string; total: number;
}
const costs: Cost[] = [
  { vehicle: "משאית", plate: "78-342-91", fuel: 4200, maintenance: 1800, driverCost: 8500, allocatedProject: "פרויקט גשר הצפון", total: 14500 },
  { vehicle: "מנוף", plate: "55-118-07", fuel: 5100, maintenance: 3200, driverCost: 9200, allocatedProject: "מגדלי הים", total: 17500 },
  { vehicle: "טנדר", plate: "31-990-42", fuel: 1800, maintenance: 600, driverCost: 7000, allocatedProject: "קניון השרון", total: 9400 },
  { vehicle: "נגרר", plate: "44-876-15", fuel: 3600, maintenance: 900, driverCost: 8500, allocatedProject: "שכונת הפארק", total: 13000 },
  { vehicle: "טנדר", plate: "19-203-68", fuel: 1650, maintenance: 450, driverCost: 7000, allocatedProject: "בית ספר אורט", total: 9100 },
  { vehicle: "משאית", plate: "93-512-40", fuel: 4500, maintenance: 2100, driverCost: 8500, allocatedProject: "מפעל טמפו", total: 15100 },
  { vehicle: "מנוף", plate: "87-654-22", fuel: 0, maintenance: 4800, driverCost: 0, allocatedProject: "תחזוקה פנימית", total: 4800 },
];

/* ── KPI aggregations ──────────────────────────────────────── */
const totalVehicles = vehicles.length;
const activeDeliveries = deliveries.filter(d => d.status === "בדרך" || d.status === "נטען").length;
const driversAvailable = vehicles.filter(v => v.status === "פעיל").length;
const craneBookings = deliveries.filter(d => d.load.includes("מנוף") || d.load.includes("הרמה")).length;
const fuelCostMonth = costs.reduce((s, c) => s + c.fuel, 0);
const delivered = deliveries.filter(d => d.status === "נמסר").length;
const delayed = deliveries.filter(d => d.status === "עיכוב").length;
const onTimeRate = delivered + delayed > 0
  ? Math.round((delivered / (delivered + delayed)) * 100)
  : 100;

/* ══════════════════════════════════════════════════════════════ */
export default function FleetDelivery() {
  const [activeTab, setActiveTab] = useState("vehicles");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-7 w-7 text-blue-400" /> רכבים והובלות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — ניהול ציי רכבים, הובלות, תכנון מסלולים ועלויות
        </p>
      </div>

      {/* ── KPI Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "סה\"כ רכבים", value: String(totalVehicles), color: "text-blue-400", icon: Truck, trend: "יציב", up: true },
          { label: "הובלות פעילות", value: String(activeDeliveries), color: "text-cyan-400", icon: Navigation, trend: `${activeDeliveries} מתוך ${deliveries.length}`, up: true },
          { label: "נהגים זמינים", value: String(driversAvailable), color: "text-emerald-400", icon: Users, trend: "+1 מאתמול", up: true },
          { label: "הזמנות מנוף", value: String(craneBookings), color: "text-purple-400", icon: Anchor, trend: "השבוע", up: true },
          { label: "עלות דלק החודש", value: nis(fuelCostMonth), color: "text-amber-400", icon: Fuel, trend: "-4.2%", up: true },
          { label: "אחוז הגעה בזמן", value: `${onTimeRate}%`, color: onTimeRate >= 85 ? "text-emerald-400" : "text-red-400", icon: Timer, trend: onTimeRate >= 85 ? "תקין" : "נמוך", up: onTimeRate >= 85 },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {kpi.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                      <span className={`text-[10px] ${kpi.up ? "text-emerald-400" : "text-red-400"}`}>{kpi.trend}</span>
                    </div>
                  </div>
                  <Icon className={`h-5 w-5 ${kpi.color} opacity-40`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Tabs ────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="vehicles" className="text-xs gap-1"><Truck className="h-3.5 w-3.5" /> רכבים</TabsTrigger>
          <TabsTrigger value="deliveries" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> הובלות</TabsTrigger>
          <TabsTrigger value="planning" className="text-xs gap-1"><Route className="h-3.5 w-3.5" /> תכנון</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs gap-1"><CreditCard className="h-3.5 w-3.5" /> עלויות</TabsTrigger>
        </TabsList>

        {/* ── Tab: Vehicles ─────────────────────────────── */}
        <TabsContent value="vehicles">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-right text-xs">לוחית רישוי</TableHead>
                    <TableHead className="text-right text-xs">סוג</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                    <TableHead className="text-right text-xs">נהג</TableHead>
                    <TableHead className="text-right text-xs">מיקום נוכחי</TableHead>
                    <TableHead className="text-right text-xs">טיפול הבא</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((v, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-sm font-semibold">{v.plate}</TableCell>
                      <TableCell className="text-sm">{v.type}</TableCell>
                      <TableCell>
                        <Badge className={`${vehicleStatusCls[v.status]} text-[11px] border-0`}>{v.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{v.driver}</TableCell>
                      <TableCell className="text-sm flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />{v.location}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground flex items-center gap-1">
                        <Wrench className="h-3 w-3" />{v.nextMaintenance}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Deliveries ──────────────────────────── */}
        <TabsContent value="deliveries">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-right text-xs">מס' הובלה</TableHead>
                    <TableHead className="text-right text-xs">פרויקט</TableHead>
                    <TableHead className="text-right text-xs">יעד</TableHead>
                    <TableHead className="text-right text-xs">נהג</TableHead>
                    <TableHead className="text-right text-xs">רכב</TableHead>
                    <TableHead className="text-right text-xs">מטען</TableHead>
                    <TableHead className="text-right text-xs">יציאה</TableHead>
                    <TableHead className="text-right text-xs">ETA</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-sm font-semibold text-blue-400">{d.id}</TableCell>
                      <TableCell className="text-sm">{d.project}</TableCell>
                      <TableCell className="text-sm flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />{d.destination}
                      </TableCell>
                      <TableCell className="text-sm">{d.driver}</TableCell>
                      <TableCell className="font-mono text-xs">{d.vehicle}</TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{d.load}</TableCell>
                      <TableCell className="text-sm font-mono">{d.departure}</TableCell>
                      <TableCell className="text-sm font-mono">{d.eta}</TableCell>
                      <TableCell>
                        <Badge className={`${deliveryStatusCls[d.status]} text-[11px] border-0`}>{d.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Trip Planning ───────────────────────── */}
        <TabsContent value="planning">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-right text-xs">מסלול</TableHead>
                    <TableHead className="text-right text-xs">עצירות</TableHead>
                    <TableHead className="text-right text-xs">זמן משוער</TableHead>
                    <TableHead className="text-right text-xs">משקל מטען</TableHead>
                    <TableHead className="text-right text-xs">רכב מוקצה</TableHead>
                    <TableHead className="text-right text-xs">נהג</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trips.map((t, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="text-sm font-semibold">{t.route}</TableCell>
                      <TableCell className="text-sm text-center">{t.stops}</TableCell>
                      <TableCell className="text-sm flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />{t.estimatedTime}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{t.loadWeight}</TableCell>
                      <TableCell className="text-xs font-mono">{t.vehicle}</TableCell>
                      <TableCell className="text-sm">{t.driver}</TableCell>
                      <TableCell>
                        <Badge className={`${tripStatusCls[t.status] || "bg-gray-500/20 text-gray-400"} text-[11px] border-0`}>{t.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                    <TableHead className="text-right text-xs">סוג רכב</TableHead>
                    <TableHead className="text-right text-xs">לוחית</TableHead>
                    <TableHead className="text-right text-xs">דלק</TableHead>
                    <TableHead className="text-right text-xs">תחזוקה</TableHead>
                    <TableHead className="text-right text-xs">עלות נהג</TableHead>
                    <TableHead className="text-right text-xs">הוקצה לפרויקט</TableHead>
                    <TableHead className="text-right text-xs">סה"כ</TableHead>
                    <TableHead className="text-right text-xs">חלק דלק</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map((c, i) => {
                    const fuelPct = c.total > 0 ? Math.round((c.fuel / c.total) * 100) : 0;
                    return (
                      <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                        <TableCell className="text-sm">{c.vehicle}</TableCell>
                        <TableCell className="font-mono text-xs">{c.plate}</TableCell>
                        <TableCell className="text-sm font-mono text-amber-400">{nis(c.fuel)}</TableCell>
                        <TableCell className="text-sm font-mono text-purple-400">{nis(c.maintenance)}</TableCell>
                        <TableCell className="text-sm font-mono text-cyan-400">{nis(c.driverCost)}</TableCell>
                        <TableCell className="text-sm">{c.allocatedProject}</TableCell>
                        <TableCell className="text-sm font-mono font-bold">{nis(c.total)}</TableCell>
                        <TableCell className="min-w-[100px]">
                          <div className="flex items-center gap-2">
                            <Progress value={fuelPct} className="h-2 flex-1" />
                            <span className="text-[10px] text-muted-foreground w-8">{fuelPct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {/* Cost summary row */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                <span className="text-sm font-semibold text-muted-foreground">סיכום חודשי</span>
                <div className="flex items-center gap-6 text-sm">
                  <span>דלק: <strong className="text-amber-400 font-mono">{nis(fuelCostMonth)}</strong></span>
                  <span>תחזוקה: <strong className="text-purple-400 font-mono">{nis(costs.reduce((s, c) => s + c.maintenance, 0))}</strong></span>
                  <span>נהגים: <strong className="text-cyan-400 font-mono">{nis(costs.reduce((s, c) => s + c.driverCost, 0))}</strong></span>
                  <span>סה"כ: <strong className="text-foreground font-mono">{nis(costs.reduce((s, c) => s + c.total, 0))}</strong></span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
