import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Truck, Package, MapPin, Clock, Fuel, CheckCircle2, Search,
  Navigation, BarChart3, FileCheck, AlertTriangle, User, Weight,
  ArrowUpRight, ArrowDownRight, Route, Shield
} from "lucide-react";

const statusColors: Record<string, string> = {
  "מתוזמן": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "בטעינה": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "בדרך": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "נמסר": "bg-green-500/20 text-green-300 border-green-500/30",
};

const FALLBACK_TRANSPORTORDERS = [
  { id: "TR-4001", customer: "אלומיניום הצפון בע\"מ", destination: "חיפה, רח׳ העצמאות 45", items: "פרופילים 6060-T5", weight: "2,400 ק\"ג", vehicle: "משאית 12 טון - 78-432-01", driver: "יוסי כהן", pickup: "07:00", delivery: "09:30", status: "נמסר" },
  { id: "TR-4002", customer: "חלונות המרכז", destination: "תל אביב, רח׳ הברזל 22", items: "חלונות מוגמרים x24", weight: "1,850 ק\"ג", vehicle: "משאית 8 טון - 54-218-03", driver: "מוחמד אבו-חמד", pickup: "07:30", delivery: "10:00", status: "בדרך" },
  { id: "TR-4003", customer: "קבוצת בנייה דרום", destination: "באר שבע, שד׳ רגר 110", items: "דלתות אלומיניום x36", weight: "3,100 ק\"ג", vehicle: "משאית 15 טון - 92-607-05", driver: "אלי ביטון", pickup: "06:30", delivery: "11:00", status: "בדרך" },
  { id: "TR-4004", customer: "זכוכיות השרון", destination: "נתניה, רח׳ שמואלי 8", items: "יחידות זיגוג x48", weight: "4,200 ק\"ג", vehicle: "משאית 18 טון - 31-890-02", driver: "דוד לוי", pickup: "08:00", delivery: "10:30", status: "בטעינה" },
  { id: "TR-4005", customer: "פלדות ירושלים", destination: "ירושלים, תלפיות", items: "מעקות בטיחות x60", weight: "2,750 ק\"ג", vehicle: "משאית 12 טון - 78-432-01", driver: "יוסי כהן", pickup: "13:00", delivery: "15:30", status: "מתוזמן" },
  { id: "TR-4006", customer: "אדריכלות מודרנית", destination: "הרצליה, רח׳ המסגר 3", items: "חיפוי חזיתות x18", weight: "5,600 ק\"ג", vehicle: "משאית 18 טון - 31-890-02", driver: "דוד לוי", pickup: "14:00", delivery: "15:30", status: "מתוזמן" },
  { id: "TR-4007", customer: "בנייני המזרח", destination: "פתח תקווה, רח׳ הרצל 90", items: "תריסי גלילה x30", weight: "1,200 ק\"ג", vehicle: "משאית 5 טון - 66-113-08", driver: "עומר חסן", pickup: "08:00", delivery: "09:15", status: "נמסר" },
  { id: "TR-4008", customer: "מפעלי עוז", destination: "עפולה, אזור תעשייה", items: "מסגרות פלדה x12", weight: "3,800 ק\"ג", vehicle: "משאית 15 טון - 92-607-05", driver: "אלי ביטון", pickup: "14:30", delivery: "17:00", status: "מתוזמן" },
  { id: "TR-4009", customer: "חברת נגב בנייה", destination: "אשדוד, נמל 4", items: "קונסטרוקציה x8", weight: "6,100 ק\"ג", vehicle: "טריילר 25 טון - 11-555-04", driver: "חיים גולן", pickup: "06:00", delivery: "08:30", status: "נמסר" },
  { id: "TR-4010", customer: "דיזיין פלוס", destination: "ראשון לציון, רח׳ הנרקיס 15", items: "פרגולות אלומיניום x6", weight: "980 ק\"ג", vehicle: "משאית 5 טון - 66-113-08", driver: "עומר חסן", pickup: "11:00", delivery: "12:30", status: "בטעינה" },
  { id: "TR-4011", customer: "מגדלי הים", destination: "אשקלון, רח׳ הנמל 60", items: "מעליות חומרים x2", weight: "7,500 ק\"ג", vehicle: "טריילר 25 טון - 11-555-04", driver: "חיים גולן", pickup: "12:00", delivery: "14:30", status: "מתוזמן" },
  { id: "TR-4012", customer: "קיבוץ גליל", destination: "כרמיאל, אזור תעשייה", items: "גדרות אלומיניום x40", weight: "2,100 ק\"ג", vehicle: "משאית 8 טון - 54-218-03", driver: "מוחמד אבו-חמד", pickup: "15:00", delivery: "18:00", status: "מתוזמן" },
];

const FALLBACK_TODAYROUTES = [
  { id: "RT-01", driver: "יוסי כהן", vehicle: "משאית 12 טון", stops: 3, distance: "145 ק\"מ", estTime: "4:30 שעות", status: "פעיל", progress: 65, orders: ["TR-4001", "TR-4005"] },
  { id: "RT-02", driver: "מוחמד אבו-חמד", vehicle: "משאית 8 טון", stops: 2, distance: "78 ק\"מ", estTime: "2:45 שעות", status: "פעיל", progress: 50, orders: ["TR-4002", "TR-4012"] },
  { id: "RT-03", driver: "אלי ביטון", vehicle: "משאית 15 טון", stops: 2, distance: "210 ק\"מ", estTime: "5:00 שעות", status: "פעיל", progress: 40, orders: ["TR-4003", "TR-4008"] },
  { id: "RT-04", driver: "דוד לוי", vehicle: "משאית 18 טון", stops: 2, distance: "52 ק\"מ", estTime: "2:00 שעות", status: "ממתין", progress: 0, orders: ["TR-4004", "TR-4006"] },
  { id: "RT-05", driver: "עומר חסן", vehicle: "משאית 5 טון", stops: 2, distance: "35 ק\"מ", estTime: "1:30 שעות", status: "פעיל", progress: 75, orders: ["TR-4007", "TR-4010"] },
  { id: "RT-06", driver: "חיים גולן", vehicle: "טריילר 25 טון", stops: 2, distance: "120 ק\"מ", estTime: "3:15 שעות", status: "פעיל", progress: 85, orders: ["TR-4009", "TR-4011"] },
];

const FALLBACK_VEHICLES = [
  { id: "78-432-01", type: "משאית 12 טון", capacity: 12000, currentLoad: 2400, trips: 2, fuelUsed: 85, status: "בדרך" },
  { id: "54-218-03", type: "משאית 8 טון", capacity: 8000, currentLoad: 1850, trips: 2, fuelUsed: 62, status: "בדרך" },
  { id: "92-607-05", type: "משאית 15 טון", capacity: 15000, currentLoad: 3100, trips: 2, fuelUsed: 110, status: "בדרך" },
  { id: "31-890-02", type: "משאית 18 טון", capacity: 18000, currentLoad: 4200, trips: 2, fuelUsed: 45, status: "בטעינה" },
  { id: "66-113-08", type: "משאית 5 טון", capacity: 5000, currentLoad: 980, trips: 2, fuelUsed: 38, status: "פעיל" },
  { id: "11-555-04", type: "טריילר 25 טון", capacity: 25000, currentLoad: 7500, trips: 2, fuelUsed: 130, status: "פעיל" },
];

const FALLBACK_DELIVERYCONFIRMATIONS = [
  { orderId: "TR-4001", customer: "אלומיניום הצפון בע\"מ", deliveredAt: "09:22", signedBy: "רונן אברהם", condition: "תקין", notes: "נמסר למחסן ראשי", hasPOD: true, hasDamage: false },
  { orderId: "TR-4007", customer: "בנייני המזרח", deliveredAt: "09:08", signedBy: "שרה מזרחי", condition: "תקין", notes: "נמסר לאתר בנייה קומה 3", hasPOD: true, hasDamage: false },
  { orderId: "TR-4009", customer: "חברת נגב בנייה", deliveredAt: "08:25", signedBy: "איתן דגן", condition: "נזק קל", notes: "שריטה קלה על יחידה #3, תועד בצילום", hasPOD: true, hasDamage: true },
];

export default function FabTransportOrders() {
  const { data: apitransportOrders } = useQuery({
    queryKey: ["/api/fabrication/fab-transport-orders/transportorders"],
    queryFn: () => authFetch("/api/fabrication/fab-transport-orders/transportorders").then(r => r.json()).catch(() => null),
  });
  const transportOrders = Array.isArray(apitransportOrders) ? apitransportOrders : (apitransportOrders?.data ?? apitransportOrders?.items ?? FALLBACK_TRANSPORTORDERS);


  const { data: apitodayRoutes } = useQuery({
    queryKey: ["/api/fabrication/fab-transport-orders/todayroutes"],
    queryFn: () => authFetch("/api/fabrication/fab-transport-orders/todayroutes").then(r => r.json()).catch(() => null),
  });
  const todayRoutes = Array.isArray(apitodayRoutes) ? apitodayRoutes : (apitodayRoutes?.data ?? apitodayRoutes?.items ?? FALLBACK_TODAYROUTES);


  const { data: apivehicles } = useQuery({
    queryKey: ["/api/fabrication/fab-transport-orders/vehicles"],
    queryFn: () => authFetch("/api/fabrication/fab-transport-orders/vehicles").then(r => r.json()).catch(() => null),
  });
  const vehicles = Array.isArray(apivehicles) ? apivehicles : (apivehicles?.data ?? apivehicles?.items ?? FALLBACK_VEHICLES);


  const { data: apideliveryConfirmations } = useQuery({
    queryKey: ["/api/fabrication/fab-transport-orders/deliveryconfirmations"],
    queryFn: () => authFetch("/api/fabrication/fab-transport-orders/deliveryconfirmations").then(r => r.json()).catch(() => null),
  });
  const deliveryConfirmations = Array.isArray(apideliveryConfirmations) ? apideliveryConfirmations : (apideliveryConfirmations?.data ?? apideliveryConfirmations?.items ?? FALLBACK_DELIVERYCONFIRMATIONS);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("orders");
  const [statusFilter, setStatusFilter] = useState("all");

  const activeOrders = transportOrders.filter(o => o.status !== "נמסר").length;
  const deliveredToday = transportOrders.filter(o => o.status === "נמסר").length;
  const vehiclesOnRoute = vehicles.filter(v => v.status === "בדרך").length;
  const onTimeRate = 94.2;
  const avgDeliveryTime = "2:15";
  const totalFuelCost = vehicles.reduce((sum, v) => sum + v.fuelUsed * 7.2, 0);

  const filteredOrders = transportOrders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.destination.toLowerCase().includes(q) || o.driver.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">הזמנות הובלה ומשלוחים</h1>
          <p className="text-muted-foreground text-sm mt-1">ניהול הובלות, מסלולים, רכבים ואישורי מסירה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Route className="w-4 h-4 ml-1" />תכנון מסלול</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700"><Truck className="w-4 h-4 ml-1" />הזמנה חדשה</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "הזמנות פעילות", value: activeOrders, icon: Package, color: "text-blue-400", bg: "bg-blue-500/10", trend: "+3", up: true },
          { label: "משלוחים היום", value: deliveredToday, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10", trend: `${deliveredToday}/12`, up: true },
          { label: "רכבים במסלול", value: vehiclesOnRoute, icon: Truck, color: "text-orange-400", bg: "bg-orange-500/10", trend: `${vehiclesOnRoute}/6`, up: true },
          { label: "אחוז בזמן", value: `${onTimeRate}%`, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10", trend: "+1.8%", up: true },
          { label: "זמן משלוח ממוצע", value: avgDeliveryTime, icon: Navigation, color: "text-cyan-400", bg: "bg-cyan-500/10", trend: "-12 דק׳", up: true },
          { label: "עלות דלק", value: `${totalFuelCost.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`, icon: Fuel, color: "text-red-400", bg: "bg-red-500/10", trend: "-5.2%", up: true },
        ].map((kpi, i) => (
          <Card key={i} className="bg-[#1a1d23] border-[#2a2d35]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <span className="flex items-center text-xs text-green-400">
                  {kpi.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {kpi.trend}
                </span>
              </div>
              <div className="text-xl font-bold text-white">{i === 5 ? `${kpi.value} \u20AA` : kpi.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#1a1d23] border-[#2a2d35]">
          <TabsTrigger value="orders">הזמנות הובלה</TabsTrigger>
          <TabsTrigger value="routes">תכנון מסלולים</TabsTrigger>
          <TabsTrigger value="vehicles">ניצולת רכבים</TabsTrigger>
          <TabsTrigger value="confirmations">אישורי מסירה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Transport Orders */}
        <TabsContent value="orders" className="space-y-4">
          <Card className="bg-[#1a1d23] border-[#2a2d35]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-white text-lg">הזמנות הובלה ({filteredOrders.length})</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="חיפוש לפי מס׳ הזמנה, לקוח, נהג..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-[#0d0f12] border-[#2a2d35]" />
                  </div>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-[#0d0f12] border border-[#2a2d35] rounded-md px-3 py-2 text-sm text-white">
                    <option value="all">כל הסטטוסים</option>
                    {Object.keys(statusColors).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2d35]">
                      {["מס׳ הזמנה", "לקוח", "יעד", "פריטים", "משקל", "רכב", "נהג", "איסוף", "מסירה", "סטטוס"].map(h => (
                        <th key={h} className="text-right p-3 text-muted-foreground font-medium text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(order => (
                      <tr key={order.id} className="border-b border-[#2a2d35]/50 hover:bg-[#22252b] transition-colors">
                        <td className="p-3 text-blue-400 font-mono font-medium">{order.id}</td>
                        <td className="p-3 text-white font-medium">{order.customer}</td>
                        <td className="p-3 text-muted-foreground text-xs">
                          <div className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{order.destination}</div>
                        </td>
                        <td className="p-3 text-white">{order.items}</td>
                        <td className="p-3 text-muted-foreground">
                          <div className="flex items-center gap-1"><Weight className="w-3 h-3" />{order.weight}</div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{order.vehicle}</td>
                        <td className="p-3 text-white">
                          <div className="flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground" />{order.driver}</div>
                        </td>
                        <td className="p-3 text-muted-foreground">{order.pickup}</td>
                        <td className="p-3 text-muted-foreground">{order.delivery}</td>
                        <td className="p-3">
                          <Badge className={`${statusColors[order.status]} border text-xs`}>{order.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Route Planning */}
        <TabsContent value="routes" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {todayRoutes.map(route => (
              <Card key={route.id} className="bg-[#1a1d23] border-[#2a2d35]">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <Route className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <span className="text-white font-medium">{route.id}</span>
                        <span className="text-muted-foreground text-xs mr-2">- {route.driver}</span>
                      </div>
                    </div>
                    <Badge className={route.status === "פעיל" ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-gray-500/20 text-gray-300 border border-gray-500/30"}>
                      {route.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div className="bg-[#0d0f12] rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">עצירות</p>
                      <p className="text-white font-bold">{route.stops}</p>
                    </div>
                    <div className="bg-[#0d0f12] rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">מרחק</p>
                      <p className="text-white font-bold text-sm">{route.distance}</p>
                    </div>
                    <div className="bg-[#0d0f12] rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">זמן משוער</p>
                      <p className="text-white font-bold text-sm">{route.estTime}</p>
                    </div>
                    <div className="bg-[#0d0f12] rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">רכב</p>
                      <p className="text-white font-bold text-xs">{route.vehicle}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">התקדמות מסלול</span>
                      <span className="text-white font-medium">{route.progress}%</span>
                    </div>
                    <Progress value={route.progress} className="h-2" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Package className="w-3 h-3" />
                    <span>הזמנות: {route.orders.join(", ")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-[#1a1d23] border-[#2a2d35]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">סיכום יומי</p>
                  <p className="text-xs text-muted-foreground mt-1">סה״כ מרחק: 640 ק״מ | סה״כ עצירות: 13 | זמן נסיעה מצטבר: 18:30 שעות</p>
                </div>
                <div className="flex gap-2">
                  <Badge className="bg-green-500/20 text-green-300 border border-green-500/30">5 מסלולים פעילים</Badge>
                  <Badge className="bg-gray-500/20 text-gray-300 border border-gray-500/30">1 ממתין</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Vehicle Utilization */}
        <TabsContent value="vehicles" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.map(v => {
              const utilization = Math.round((v.currentLoad / v.capacity) * 100);
              const utilizationColor = utilization > 80 ? "text-green-400" : utilization > 50 ? "text-yellow-400" : "text-red-400";
              return (
                <Card key={v.id} className="bg-[#1a1d23] border-[#2a2d35]">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                          <Truck className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{v.type}</p>
                          <p className="text-xs text-muted-foreground">{v.id}</p>
                        </div>
                      </div>
                      <Badge className={v.status === "בדרך" ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" : v.status === "בטעינה" ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" : "bg-green-500/20 text-green-300 border border-green-500/30"}>
                        {v.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">ניצולת עומס</span>
                        <span className={`font-bold ${utilizationColor}`}>{utilization}%</span>
                      </div>
                      <Progress value={utilization} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{v.currentLoad.toLocaleString()} ק״ג נוכחי</span>
                        <span>{v.capacity.toLocaleString()} ק״ג קיבולת</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#0d0f12] rounded-lg p-2 text-center">
                        <p className="text-xs text-muted-foreground">נסיעות היום</p>
                        <p className="text-white font-bold">{v.trips}</p>
                      </div>
                      <div className="bg-[#0d0f12] rounded-lg p-2 text-center">
                        <p className="text-xs text-muted-foreground">דלק (ליטר)</p>
                        <p className="text-white font-bold">{v.fuelUsed}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="bg-[#1a1d23] border-[#2a2d35]">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base">סיכום ניצולת צי</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#0d0f12] rounded-lg p-3 text-center">
                  <BarChart3 className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">ניצולת ממוצעת</p>
                  <p className="text-white font-bold text-lg">68%</p>
                </div>
                <div className="bg-[#0d0f12] rounded-lg p-3 text-center">
                  <Weight className="w-5 h-5 text-green-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">עומס כולל</p>
                  <p className="text-white font-bold text-lg">20,030 ק״ג</p>
                </div>
                <div className="bg-[#0d0f12] rounded-lg p-3 text-center">
                  <Truck className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">קיבולת כוללת</p>
                  <p className="text-white font-bold text-lg">83,000 ק״ג</p>
                </div>
                <div className="bg-[#0d0f12] rounded-lg p-3 text-center">
                  <Fuel className="w-5 h-5 text-red-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">עלות דלק יומית</p>
                  <p className="text-white font-bold text-lg">{totalFuelCost.toLocaleString("he-IL", { maximumFractionDigits: 0 })} \u20AA</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Delivery Confirmations */}
        <TabsContent value="confirmations" className="space-y-4">
          <Card className="bg-[#1a1d23] border-[#2a2d35]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-lg">אישורי מסירה - היום</CardTitle>
                <Badge className="bg-green-500/20 text-green-300 border border-green-500/30">{deliveryConfirmations.length} אושרו</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {deliveryConfirmations.map(dc => (
                <div key={dc.orderId} className="bg-[#0d0f12] rounded-lg p-4 border border-[#2a2d35]/50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${dc.hasDamage ? "bg-red-500/10" : "bg-green-500/10"}`}>
                        {dc.hasDamage ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <CheckCircle2 className="w-5 h-5 text-green-400" />}
                      </div>
                      <div>
                        <p className="text-white font-medium">{dc.orderId} - {dc.customer}</p>
                        <p className="text-xs text-muted-foreground">נמסר בשעה {dc.deliveredAt}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {dc.hasPOD && <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs"><FileCheck className="w-3 h-3 ml-1" />POD</Badge>}
                      {dc.hasDamage && <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs"><AlertTriangle className="w-3 h-3 ml-1" />דו״ח נזק</Badge>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">חתימת מקבל</p>
                      <p className="text-white flex items-center gap-1"><Shield className="w-3 h-3 text-green-400" />{dc.signedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">מצב הסחורה</p>
                      <p className={dc.hasDamage ? "text-red-400" : "text-green-400"}>{dc.condition}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">הערות</p>
                      <p className="text-white">{dc.notes}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="bg-[#1a1d23] border-[#2a2d35]">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-[#0d0f12] rounded-lg p-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">מסירות תקינות</p>
                  <p className="text-white font-bold text-lg">2</p>
                </div>
                <div className="bg-[#0d0f12] rounded-lg p-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">דוחות נזק</p>
                  <p className="text-white font-bold text-lg">1</p>
                </div>
                <div className="bg-[#0d0f12] rounded-lg p-3">
                  <FileCheck className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">חתימות דיגיטליות</p>
                  <p className="text-white font-bold text-lg">3/3</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
