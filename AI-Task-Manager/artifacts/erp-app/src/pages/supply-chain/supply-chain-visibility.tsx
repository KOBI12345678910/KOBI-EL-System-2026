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
  Package, TrendingUp, Clock, ShieldCheck, AlertTriangle, Truck,
  Ship, Plane, MapPin, Search, RefreshCw, Warehouse, BarChart3,
  ArrowLeftRight, CheckCircle, XCircle, Timer, DollarSign, Globe,
} from "lucide-react";

// ── Mock Data ──────────────────────────────────────────────────────────────

const kpis = [
  { title: "משלוחים פעילים", value: "47", icon: Truck, color: "bg-blue-100 text-blue-700", trend: "+3 מאתמול" },
  { title: "שווי במעבר ₪", value: "2,340,000", icon: DollarSign, color: "bg-emerald-100 text-emerald-700", trend: "₪180K חדש היום" },
  { title: "זמן מעבר ממוצע (ימים)", value: "14.2", icon: Clock, color: "bg-amber-100 text-amber-700", trend: "↓0.8 מהחודש שעבר" },
  { title: "מכס ממוצע (ימים)", value: "2.4", icon: ShieldCheck, color: "bg-purple-100 text-purple-700", trend: "יציב" },
  { title: "הגעה בזמן %", value: "87.3%", icon: CheckCircle, color: "bg-green-100 text-green-700", trend: "↑2.1% מהרבעון הקודם" },
  { title: "משלוחים מעוכבים", value: "6", icon: AlertTriangle, color: "bg-red-100 text-red-700", trend: "2 קריטיים" },
];

const FALLBACK_SHIPMENTS = [
  { id: "SHP-2026-001", supplier: "אלומטק טורקיה", origin: "טורקיה", mode: "sea" as const, departure: "2026-03-20", eta: "2026-04-12", location: "נמל אשדוד - ממתין לפריקה", progress: 92, status: "customs" as const, customs: "בבדיקה" },
  { id: "SHP-2026-002", supplier: "גלאסקו איטליה", origin: "איטליה", mode: "sea" as const, departure: "2026-03-25", eta: "2026-04-14", location: "ים תיכון - מערב כרתים", progress: 68, status: "transit" as const, customs: "טרם הוגש" },
  { id: "SHP-2026-003", supplier: "שנזן מטלס", origin: "סין", mode: "sea" as const, departure: "2026-03-10", eta: "2026-04-08", location: "נמל חיפה - בפריקה", progress: 98, status: "arrived" as const, customs: "אושר" },
  { id: "SHP-2026-004", supplier: "מטאל וורקס GmbH", origin: "גרמניה", mode: "air" as const, departure: "2026-04-05", eta: "2026-04-07", location: "נתב״ג - טרמינל מטען", progress: 95, status: "customs" as const, customs: "בבדיקה" },
  { id: "SHP-2026-005", supplier: "אנטליה פרופילים", origin: "טורקיה", mode: "land" as const, departure: "2026-04-01", eta: "2026-04-09", location: "גבול ירדן - מעבר שייח חוסיין", progress: 78, status: "transit" as const, customs: "ממתין" },
  { id: "SHP-2026-006", supplier: "ביג גלאס בע״מ", origin: "סין", mode: "sea" as const, departure: "2026-03-15", eta: "2026-04-10", location: "תעלת סואץ", progress: 82, status: "transit" as const, customs: "טרם הוגש" },
  { id: "SHP-2026-007", supplier: "אלופרו ספרד", origin: "ספרד", mode: "sea" as const, departure: "2026-03-28", eta: "2026-04-18", location: "ים תיכון - דרום סרדיניה", progress: 45, status: "transit" as const, customs: "טרם הוגש" },
  { id: "SHP-2026-008", supplier: "פרופיל טק", origin: "טורקיה", mode: "sea" as const, departure: "2026-04-02", eta: "2026-04-15", location: "נמל מרסין", progress: 15, status: "loading" as const, customs: "טרם הוגש" },
  { id: "SHP-2026-009", supplier: "באייר אלומיניום", origin: "גרמניה", mode: "air" as const, departure: "2026-04-06", eta: "2026-04-08", location: "מעל יוון", progress: 60, status: "transit" as const, customs: "הוגש מראש" },
  { id: "SHP-2026-010", supplier: "וטרו גלאס מילאנו", origin: "איטליה", mode: "sea" as const, departure: "2026-03-22", eta: "2026-04-11", location: "נמל אשדוד - עוגן", progress: 88, status: "customs" as const, customs: "בעיכוב" },
  { id: "SHP-2026-011", supplier: "דונגגואן מטלס", origin: "סין", mode: "sea" as const, departure: "2026-03-05", eta: "2026-04-06", location: "מחסן טכנו-כל ראשי", progress: 100, status: "delivered" as const, customs: "אושר" },
  { id: "SHP-2026-012", supplier: "איזמיר פרופילים", origin: "טורקיה", mode: "sea" as const, departure: "2026-04-03", eta: "2026-04-16", location: "נמל איזמיר", progress: 10, status: "loading" as const, customs: "טרם הוגש" },
  { id: "SHP-2026-013", supplier: "ברלין סטיל", origin: "גרמניה", mode: "land" as const, departure: "2026-03-30", eta: "2026-04-13", location: "רומניה - מעבר גבול", progress: 52, status: "transit" as const, customs: "הוגש מראש" },
  { id: "SHP-2026-014", supplier: "גואנגז׳ו גלאס", origin: "סין", mode: "air" as const, departure: "2026-04-07", eta: "2026-04-10", location: "הונג קונג - מחכה לטיסה", progress: 20, status: "transit" as const, customs: "טרם הוגש" },
  { id: "SHP-2026-015", supplier: "אלוטק אנקרה", origin: "טורקיה", mode: "sea" as const, departure: "2026-03-18", eta: "2026-04-09", location: "נמל חיפה - ממתין לפריקה", progress: 90, status: "customs" as const, customs: "בבדיקה" },
];

const FALLBACK_WAREHOUSES = [
  { id: "WH-01", name: "מחסן ראשי - אשדוד", capacity: 87, items: 12450, value: "4,250,000", lastUpdate: "08/04/2026 09:15", topItems: [
    { name: "פרופיל אלומיניום 6060", qty: 3200, unit: "מטר" }, { name: "זכוכית מחוסמת 8מ״מ", qty: 1850, unit: "יח׳" }, { name: "חומר איטום סיליקון", qty: 4200, unit: "יח׳" }
  ]},
  { id: "WH-02", name: "מחסן חיפה", capacity: 62, items: 7830, value: "2,180,000", lastUpdate: "08/04/2026 08:45", topItems: [
    { name: "פרופיל תרמי 6063", qty: 2100, unit: "מטר" }, { name: "זכוכית שקופה 6מ״מ", qty: 920, unit: "יח׳" }, { name: "ברגים נירוסטה", qty: 15000, unit: "יח׳" }
  ]},
  { id: "WH-03", name: "מחסן ב״ש - נגב", capacity: 41, items: 4200, value: "1,350,000", lastUpdate: "08/04/2026 07:30", topItems: [
    { name: "פרופיל הזזה כבד", qty: 800, unit: "מטר" }, { name: "זכוכית למינציה", qty: 650, unit: "יח׳" }, { name: "ידיות אלומיניום", qty: 3400, unit: "יח׳" }
  ]},
  { id: "WH-04", name: "מחסן ת״א - מרכז", capacity: 93, items: 15200, value: "5,870,000", lastUpdate: "08/04/2026 09:30", topItems: [
    { name: "פרופיל קורטן", qty: 1600, unit: "מטר" }, { name: "זכוכית דו-שכבתית", qty: 2200, unit: "יח׳" }, { name: "אטמי EPDM", qty: 8500, unit: "מטר" }
  ]},
  { id: "WH-05", name: "מחסן חירום - לוד", capacity: 28, items: 2100, value: "890,000", lastUpdate: "07/04/2026 17:00", topItems: [
    { name: "פרופיל אלומיניום חירום", qty: 450, unit: "מטר" }, { name: "זכוכית חירום 10מ״מ", qty: 300, unit: "יח׳" }, { name: "חומרי אריזה", qty: 1200, unit: "יח׳" }
  ]},
];

const FALLBACK_BOTTLENECKS = [
  { type: "customs", title: "עיכוב מכס - נמל אשדוד", count: 3, impact: "גבוה", items: ["SHP-2026-001", "SHP-2026-010", "SHP-2026-015"], desc: "בדיקות אבטחה מוגברות בשל התראה רגולטורית", etaResolution: "09/04/2026", cost: "₪45,000/יום" },
  { type: "port", title: "עומס בנמל חיפה", count: 1, impact: "בינוני", items: ["SHP-2026-003"], desc: "צפיפות בנמל - זמן המתנה מוגדל ב-48 שעות", etaResolution: "10/04/2026", cost: "₪18,000/יום" },
  { type: "supplier", title: "עיכוב ספקים", count: 4, impact: "גבוה", items: ["SHP-2026-008", "SHP-2026-012", "SHP-2026-007", "SHP-2026-014"], desc: "עיכובי ייצור אצל ספקים בטורקיה וספרד, חוסר חומרי גלם", etaResolution: "15/04/2026", cost: "₪72,000 סה״כ" },
  { type: "quality", title: "עצירת איכות", count: 2, impact: "קריטי", items: ["SHP-2026-006", "SHP-2026-013"], desc: "בדיקת איכות נכשלה - פרופילים לא עומדים בתקן ישראלי ת״י", etaResolution: "12/04/2026", cost: "₪125,000 סה״כ" },
];

const FALLBACK_ROUTES = [
  { origin: "טורקיה", dest: "אשדוד", mode: "ים", avgDays: 12, reliability: 91, avgCost: "₪18,500", shipments: 156, icon: Ship },
  { origin: "סין", dest: "חיפה", mode: "ים", avgDays: 28, reliability: 84, avgCost: "₪42,000", shipments: 89, icon: Ship },
  { origin: "איטליה", dest: "אשדוד", mode: "ים", avgDays: 10, reliability: 93, avgCost: "₪15,200", shipments: 72, icon: Ship },
  { origin: "גרמניה", dest: "חיפה", mode: "אוויר", avgDays: 3, reliability: 97, avgCost: "₪8,400", shipments: 45, icon: Plane },
  { origin: "גרמניה", dest: "חיפה", mode: "יבשה", avgDays: 14, reliability: 82, avgCost: "₪22,000", shipments: 31, icon: Truck },
  { origin: "טורקיה", dest: "חיפה", mode: "יבשה", avgDays: 8, reliability: 88, avgCost: "₪12,300", shipments: 64, icon: Truck },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const modeIcons: Record<string, typeof Ship> = { sea: Ship, air: Plane, land: Truck };
const modeLabels: Record<string, string> = { sea: "ימי", air: "אווירי", land: "יבשתי" };

const statusConfig: Record<string, { label: string; color: string }> = {
  loading: { label: "בטעינה", color: "bg-slate-100 text-slate-700" },
  transit: { label: "במעבר", color: "bg-blue-100 text-blue-700" },
  customs: { label: "מכס", color: "bg-amber-100 text-amber-700" },
  arrived: { label: "הגיע", color: "bg-green-100 text-green-700" },
  delivered: { label: "נמסר", color: "bg-emerald-100 text-emerald-700" },
};

const impactColors: Record<string, string> = {
  "קריטי": "bg-red-100 text-red-700 border-red-200",
  "גבוה": "bg-orange-100 text-orange-700 border-orange-200",
  "בינוני": "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const bottleneckIcons: Record<string, typeof AlertTriangle> = {
  customs: ShieldCheck, port: Ship, supplier: Package, quality: XCircle,
};

function progressColor(p: number) {
  if (p >= 90) return "bg-green-500";
  if (p >= 60) return "bg-blue-500";
  if (p >= 30) return "bg-amber-500";
  return "bg-slate-400";
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SupplyChainVisibilityPage() {
  const { data: apishipments } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-visibility/shipments"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-visibility/shipments").then(r => r.json()).catch(() => null),
  });
  const shipments = Array.isArray(apishipments) ? apishipments : (apishipments?.data ?? apishipments?.items ?? FALLBACK_SHIPMENTS);


  const { data: apiwarehouses } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-visibility/warehouses"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-visibility/warehouses").then(r => r.json()).catch(() => null),
  });
  const warehouses = Array.isArray(apiwarehouses) ? apiwarehouses : (apiwarehouses?.data ?? apiwarehouses?.items ?? FALLBACK_WAREHOUSES);


  const { data: apibottlenecks } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-visibility/bottlenecks"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-visibility/bottlenecks").then(r => r.json()).catch(() => null),
  });
  const bottlenecks = Array.isArray(apibottlenecks) ? apibottlenecks : (apibottlenecks?.data ?? apibottlenecks?.items ?? FALLBACK_BOTTLENECKS);


  const { data: apiroutes } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-visibility/routes"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-visibility/routes").then(r => r.json()).catch(() => null),
  });
  const routes = Array.isArray(apiroutes) ? apiroutes : (apiroutes?.data ?? apiroutes?.items ?? FALLBACK_ROUTES);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("shipments");

  const filtered = shipments.filter(
    (s) => s.id.includes(search) || s.supplier.includes(search) || s.origin.includes(search) || s.location.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">נראות שרשרת אספקה ומעקב</h1>
          <p className="text-muted-foreground text-sm">טכנו-כל עוזי - מעקב אחר משלוחים, מלאי ומסלולים בזמן אמת</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><RefreshCw className="h-4 w-4 ml-1" />רענון נתונים</Button>
          <Button size="sm"><Globe className="h-4 w-4 ml-1" />מפת משלוחים</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.title}</p>
                    <p className="text-xl font-bold mt-1">{kpi.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.trend}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${kpi.color}`}><Icon className="h-5 w-5" /></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="shipments"><Truck className="h-4 w-4 ml-1" />מעקב משלוחים</TabsTrigger>
          <TabsTrigger value="inventory"><Warehouse className="h-4 w-4 ml-1" />נראות מלאי</TabsTrigger>
          <TabsTrigger value="bottlenecks"><AlertTriangle className="h-4 w-4 ml-1" />צוואר בקבוק</TabsTrigger>
          <TabsTrigger value="routes"><ArrowLeftRight className="h-4 w-4 ml-1" />היסטוריית מסלולים</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Shipment Tracking ──────────────────────────────────────── */}
        <TabsContent value="shipments" className="space-y-4">
          <div className="flex gap-2 items-center max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש לפי מזהה, ספק, מקור או מיקום..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="space-y-3">
            {filtered.map((s) => {
              const ModeIcon = modeIcons[s.mode];
              const st = statusConfig[s.status];
              return (
                <Card key={s.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Identity */}
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className="p-2 rounded-lg bg-muted"><ModeIcon className="h-5 w-5" /></div>
                        <div>
                          <p className="font-semibold text-sm">{s.id}</p>
                          <p className="text-xs text-muted-foreground">{s.supplier}</p>
                        </div>
                      </div>

                      {/* Route */}
                      <div className="flex items-center gap-2 text-sm min-w-[140px]">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{s.origin}</span>
                        <span className="text-muted-foreground">→</span>
                        <Badge variant="outline" className="text-[10px]">{modeLabels[s.mode]}</Badge>
                      </div>

                      {/* Dates */}
                      <div className="text-xs text-muted-foreground min-w-[150px]">
                        <div>יציאה: {s.departure}</div>
                        <div>ETA: {s.eta}</div>
                      </div>

                      {/* Location */}
                      <div className="flex-1 text-sm">
                        <p className="text-xs text-muted-foreground">מיקום נוכחי</p>
                        <p className="font-medium text-xs">{s.location}</p>
                      </div>

                      {/* Progress */}
                      <div className="min-w-[140px]">
                        <div className="flex items-center justify-between mb-1">
                          <Badge className={st.color + " text-[10px]"}>{st.label}</Badge>
                          <span className="text-xs font-bold">{s.progress}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${progressColor(s.progress)}`} style={{ width: `${s.progress}%` }} />
                        </div>
                      </div>

                      {/* Customs */}
                      <div className="min-w-[80px] text-center">
                        <p className="text-[10px] text-muted-foreground">מכס</p>
                        <Badge variant={s.customs === "אושר" ? "default" : s.customs === "בעיכוב" ? "destructive" : "outline"} className="text-[10px]">
                          {s.customs}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground text-center">מציג {filtered.length} מתוך {shipments.length} משלוחים</p>
        </TabsContent>

        {/* ── Tab 2: Inventory Visibility ───────────────────────────────────── */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.map((w) => (
              <Card key={w.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{w.name}</CardTitle>
                    <Badge variant="outline" className="text-[10px]">{w.id}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">תפוסה</p>
                      <div className="flex items-center gap-2">
                        <Progress value={w.capacity} className="h-2 flex-1" />
                        <span className="font-bold text-xs">{w.capacity}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">פריטים</p>
                      <p className="font-bold">{w.items.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">שווי ₪</p>
                      <p className="font-bold">₪{w.value}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">עדכון אחרון</p>
                      <p className="text-xs">{w.lastUpdate}</p>
                    </div>
                  </div>
                  <div className="border-t pt-2">
                    <p className="text-xs font-semibold mb-1.5">פריטים מובילים</p>
                    {w.topItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5">
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-medium">{item.qty.toLocaleString()} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Summary row */}
          <Card>
            <CardContent className="py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">סה״כ מחסנים</p>
                  <p className="text-2xl font-bold">{warehouses.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">סה״כ פריטים</p>
                  <p className="text-2xl font-bold">{warehouses.reduce((a, w) => a + w.items, 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">תפוסה ממוצעת</p>
                  <p className="text-2xl font-bold">{Math.round(warehouses.reduce((a, w) => a + w.capacity, 0) / warehouses.length)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">שווי כולל ₪</p>
                  <p className="text-2xl font-bold">₪14,540,000</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Bottlenecks ───────────────────────────────────────────── */}
        <TabsContent value="bottlenecks" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "עיכובי מכס", count: 3, color: "text-amber-600" },
              { label: "עומס בנמל", count: 1, color: "text-blue-600" },
              { label: "עיכובי ספקים", count: 4, color: "text-orange-600" },
              { label: "עצירות איכות", count: 2, color: "text-red-600" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="py-3 text-center">
                  <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-3">
            {bottlenecks.map((b, i) => {
              const BIcon = bottleneckIcons[b.type];
              return (
                <Card key={i} className={`border ${impactColors[b.impact]?.split(" ")[0] ? "border-l-4" : ""}`} style={{ borderRightColor: b.impact === "קריטי" ? "#ef4444" : b.impact === "גבוה" ? "#f97316" : "#eab308", borderRightWidth: 4 }}>
                  <CardContent className="py-4">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <div className="p-2 rounded-lg bg-muted"><BIcon className="h-5 w-5" /></div>
                        <div>
                          <p className="font-semibold text-sm">{b.title}</p>
                          <Badge className={impactColors[b.impact] + " text-[10px]"}>{b.impact}</Badge>
                        </div>
                      </div>

                      <div className="flex-1 space-y-1">
                        <p className="text-sm">{b.desc}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {b.items.map((id) => (
                            <Badge key={id} variant="outline" className="text-[10px] font-mono">{id}</Badge>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 min-w-[200px] text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">צפי פתרון</p>
                          <p className="font-medium">{b.etaResolution}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">עלות השפעה</p>
                          <p className="font-medium text-red-600">{b.cost}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="bg-red-50 border-red-200">
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-red-600" />
                <p className="text-sm font-medium text-red-700">סה״כ עלות עיכובים יומית משוערת: ₪135,000 | 10 משלוחים מושפעים | 2 בסיכון קריטי</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Route History ─────────────────────────────────────────── */}
        <TabsContent value="routes" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routes.map((r, i) => {
              const RIcon = r.icon;
              return (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RIcon className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm">{r.origin} → {r.dest}</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{r.mode}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">זמן מעבר ממוצע</p>
                        <p className="text-lg font-bold">{r.avgDays} <span className="text-xs font-normal">ימים</span></p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">אמינות</p>
                        <div className="flex items-center gap-1">
                          <p className="text-lg font-bold">{r.reliability}%</p>
                          {r.reliability >= 90 ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">עלות ממוצעת</p>
                        <p className="font-bold">{r.avgCost}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">משלוחים (12 חודשים)</p>
                        <p className="font-bold">{r.shipments}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">אמינות מסלול</p>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${r.reliability >= 90 ? "bg-green-500" : r.reliability >= 85 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${r.reliability}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Route summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />סיכום מסלולים - 12 חודשים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">סה״כ משלוחים</p>
                  <p className="text-2xl font-bold">{routes.reduce((a, r) => a + r.shipments, 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">מסלול מהיר ביותר</p>
                  <p className="text-sm font-bold">גרמניה → חיפה (אוויר)</p>
                  <p className="text-xs text-muted-foreground">3 ימים בממוצע</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">מסלול אמין ביותר</p>
                  <p className="text-sm font-bold">גרמניה → חיפה (אוויר)</p>
                  <p className="text-xs text-muted-foreground">97% אמינות</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">מסלול חסכוני ביותר</p>
                  <p className="text-sm font-bold">גרמניה → חיפה (אוויר)</p>
                  <p className="text-xs text-muted-foreground">₪8,400 לשילוח</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
