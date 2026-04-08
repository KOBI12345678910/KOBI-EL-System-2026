import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Calculator, Truck, Fuel, MapPin, TrendingDown, TrendingUp,
  DollarSign, BarChart3, ArrowDownRight, ArrowUpRight, Route
} from "lucide-react";

/* ── helpers ──────────────────────────────────────────────────── */
const nis = (v: number) => `₪${v.toLocaleString("he-IL")}`;
const pct = (v: number) => `${v > 0 ? "+" : ""}${v}%`;

/* ── KPI data ─────────────────────────────────────────────────── */
const FALLBACK_KPIS = [
  { label: "עלות משלוח ממוצעת", value: nis(1250), icon: DollarSign, color: "text-blue-400" },
  { label: 'עלות ל-ק"מ', value: "₪4.80", icon: Route, color: "text-cyan-400" },
  { label: "משלוחים החודש", value: "42", icon: Truck, color: "text-emerald-400" },
  { label: "עלות כוללת", value: nis(52500), icon: BarChart3, color: "text-amber-400" },
  { label: "חיסכון מול חיצוני", value: "-22%", icon: TrendingDown, color: "text-green-400", badge: true },
];

/* ── FALLBACK_DELIVERIES table data (12 rows) ─────────────────────────── */
interface Delivery {
  id: string; project: string; destination: string; km: number;
  vehicle: string; driver: string; fuel: number; driverCost: number;
  crane: number; tolls: number; total: number;
}
const deliveries: Delivery[] = [
  { id: "DL-1041", project: "פרויקט אשדוד מגדלים", destination: "אשדוד", km: 45, vehicle: "78-342-91", driver: "מאיר אוחנה", fuel: 180, driverCost: 350, crane: 0, tolls: 35, total: 565 },
  { id: "DL-1042", project: "מרכז מסחרי נתניה", destination: "נתניה", km: 28, vehicle: "31-990-42", driver: "יוסי כהן", fuel: 110, driverCost: 280, crane: 0, tolls: 18, total: 408 },
  { id: "DL-1043", project: "קאנטרי קלאב הרצליה", destination: "הרצליה", km: 22, vehicle: "55-118-07", driver: "דוד לוי", fuel: 95, driverCost: 280, crane: 850, tolls: 12, total: 1237 },
  { id: "DL-1044", project: "בית חולים סורוקה", destination: "באר שבע", km: 110, vehicle: "44-876-15", driver: "אבי מזרחי", fuel: 420, driverCost: 520, crane: 0, tolls: 85, total: 1025 },
  { id: "DL-1045", project: "מגדל המשרדים ת\"א", destination: "תל אביב", km: 15, vehicle: "19-203-68", driver: "חיים פרץ", fuel: 65, driverCost: 250, crane: 1200, tolls: 8, total: 1523 },
  { id: "DL-1046", project: "מפעל היי-טק כפ\"ס", destination: "כפר סבא", km: 32, vehicle: "93-512-40", driver: "רון ביטון", fuel: 130, driverCost: 300, crane: 0, tolls: 22, total: 452 },
  { id: "DL-1047", project: "פרויקט גבעת שמואל", destination: "גבעת שמואל", km: 18, vehicle: "78-342-91", driver: "מאיר אוחנה", fuel: 75, driverCost: 250, crane: 0, tolls: 10, total: 335 },
  { id: "DL-1048", project: "נמל חיפה — הרחבה", destination: "חיפה", km: 95, vehicle: "93-512-40", driver: "רון ביטון", fuel: 380, driverCost: 480, crane: 1500, tolls: 65, total: 2425 },
  { id: "DL-1049", project: "מלון ים המלח", destination: "ים המלח", km: 160, vehicle: "44-876-15", driver: "אבי מזרחי", fuel: 620, driverCost: 650, crane: 0, tolls: 95, total: 1365 },
  { id: "DL-1050", project: "תחנת כוח אשקלון", destination: "אשקלון", km: 65, vehicle: "55-118-07", driver: "דוד לוי", fuel: 260, driverCost: 380, crane: 950, tolls: 45, total: 1635 },
  { id: "DL-1051", project: "בית ספר ירושלים", destination: "ירושלים", km: 72, vehicle: "19-203-68", driver: "חיים פרץ", fuel: 290, driverCost: 400, crane: 0, tolls: 55, total: 745 },
  { id: "DL-1052", project: "מרכז לוגיסטי שורק", destination: "שורק", km: 35, vehicle: "31-990-42", driver: "יוסי כהן", fuel: 140, driverCost: 300, crane: 0, tolls: 20, total: 460 },
];

/* ── vehicles cost data (8 rows) ──────────────────────────────── */
interface VehicleCost {
  plate: string; type: string; totalCost: number; deliveries: number; avgCost: number;
}
const FALLBACK_VEHICLE_COSTS: VehicleCost[] = [
  { plate: "78-342-91", type: "משאית", totalCost: 8400, deliveries: 9, avgCost: 933 },
  { plate: "55-118-07", type: "מנוף", totalCost: 12200, deliveries: 7, avgCost: 1743 },
  { plate: "31-990-42", type: "טנדר", totalCost: 4100, deliveries: 8, avgCost: 513 },
  { plate: "44-876-15", type: "נגרר", totalCost: 9600, deliveries: 6, avgCost: 1600 },
  { plate: "19-203-68", type: "טנדר", totalCost: 5300, deliveries: 7, avgCost: 757 },
  { plate: "93-512-40", type: "משאית", totalCost: 7800, deliveries: 5, avgCost: 1560 },
  { plate: "87-654-22", type: "מנוף", totalCost: 3200, deliveries: 2, avgCost: 1600 },
  { plate: "62-457-33", type: "משאית", totalCost: 1900, deliveries: 1, avgCost: 1900 },
];

/* ── FALLBACK_REGIONS data (5 rows) ────────────────────────────────────── */
interface RegionCost {
  name: string; deliveries: number; avgKm: number; avgCost: number; color: string;
}
const FALLBACK_REGIONS: RegionCost[] = [
  { name: "מרכז", deliveries: 14, avgKm: 22, avgCost: 680, color: "bg-blue-500" },
  { name: "צפון", deliveries: 8, avgKm: 88, avgCost: 1850, color: "bg-emerald-500" },
  { name: "דרום", deliveries: 9, avgKm: 105, avgCost: 1320, color: "bg-amber-500" },
  { name: "ירושלים", deliveries: 6, avgKm: 68, avgCost: 920, color: "bg-purple-500" },
  { name: "שרון", deliveries: 5, avgKm: 30, avgCost: 520, color: "bg-cyan-500" },
];

/* ── internal vs external comparison ──────────────────────────── */
interface CostComparison {
  category: string; internal: number; external: number; savings: number; savingsPct: number;
}
const FALLBACK_COMPARISONS: CostComparison[] = [
  { category: "משלוח רגיל — מרכז", internal: 680, external: 950, savings: 270, savingsPct: -28 },
  { category: "משלוח עם מנוף", internal: 1740, external: 2400, savings: 660, savingsPct: -28 },
  { category: "משלוח צפון", internal: 1850, external: 2200, savings: 350, savingsPct: -16 },
  { category: "משלוח דרום", internal: 1320, external: 1650, savings: 330, savingsPct: -20 },
  { category: "משלוח דחוף", internal: 1950, external: 2800, savings: 850, savingsPct: -30 },
  { category: "חומרים מיוחדים", internal: 2100, external: 2550, savings: 450, savingsPct: -18 },
];

/* ── monthly trend (6 months) ─────────────────────────────────── */
interface MonthTrend {
  month: string; totalCost: number; deliveries: number; avgCost: number; change: number;
}
const FALLBACK_MONTHLY_TREND: MonthTrend[] = [
  { month: "נובמבר 2025", totalCost: 48200, deliveries: 38, avgCost: 1268, change: 0 },
  { month: "דצמבר 2025", totalCost: 44800, deliveries: 35, avgCost: 1280, change: 0.9 },
  { month: "ינואר 2026", totalCost: 51300, deliveries: 40, avgCost: 1283, change: 0.2 },
  { month: "פברואר 2026", totalCost: 49700, deliveries: 39, avgCost: 1274, change: -0.7 },
  { month: "מרץ 2026", totalCost: 53100, deliveries: 41, avgCost: 1295, change: 1.6 },
  { month: "אפריל 2026", totalCost: 52500, deliveries: 42, avgCost: 1250, change: -3.5 },
];

const maxRegionDeliveries = Math.max(...FALLBACK_REGIONS.map(r => r.deliveries));

/* ── component ────────────────────────────────────────────────── */
export default function DeliveryCostAnalysisPage() {
  const { data: kpis = FALLBACK_KPIS } = useQuery({
    queryKey: ["logistics-kpis"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/delivery-cost-analysis/kpis");
      if (!res.ok) return FALLBACK_KPIS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_KPIS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: deliveries = FALLBACK_DELIVERIES } = useQuery({
    queryKey: ["logistics-deliveries"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/delivery-cost-analysis/deliveries");
      if (!res.ok) return FALLBACK_DELIVERIES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DELIVERIES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: vehicleCosts = FALLBACK_VEHICLE_COSTS } = useQuery({
    queryKey: ["logistics-vehicle-costs"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/delivery-cost-analysis/vehicle-costs");
      if (!res.ok) return FALLBACK_VEHICLE_COSTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_VEHICLE_COSTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: regions = FALLBACK_REGIONS } = useQuery({
    queryKey: ["logistics-regions"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/delivery-cost-analysis/regions");
      if (!res.ok) return FALLBACK_REGIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_REGIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: comparisons = FALLBACK_COMPARISONS } = useQuery({
    queryKey: ["logistics-comparisons"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/delivery-cost-analysis/comparisons");
      if (!res.ok) return FALLBACK_COMPARISONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COMPARISONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: monthlyTrend = FALLBACK_MONTHLY_TREND } = useQuery({
    queryKey: ["logistics-monthly-trend"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/delivery-cost-analysis/monthly-trend");
      if (!res.ok) return FALLBACK_MONTHLY_TREND;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MONTHLY_TREND;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [tab, setTab] = useState("deliveries");

  return (
    <div dir="rtl" className="p-6 space-y-6 min-h-screen text-gray-100">
      {/* ── header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Calculator className="h-7 w-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">ניתוח עלויות משלוח</h1>
          <p className="text-sm text-gray-400">טכנו-כל עוזי — ניתוח עלויות לוגיסטיקה ומשלוחים</p>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-gray-900 border-gray-800">
            <CardContent className="p-4 flex flex-col items-center text-center gap-1">
              <k.icon className={`h-5 w-5 ${k.color}`} />
              <span className="text-xs text-gray-400">{k.label}</span>
              {k.badge ? (
                <Badge className="bg-green-500/20 text-green-400 text-lg font-bold">{k.value}</Badge>
              ) : (
                <span className="text-lg font-bold text-white">{k.value}</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── tabs ───────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="deliveries">עלות למשלוח</TabsTrigger>
          <TabsTrigger value="vehicles">עלות לרכב</TabsTrigger>
          <TabsTrigger value="regions">עלות לאזור</TabsTrigger>
          <TabsTrigger value="comparison">פנימי מול חיצוני</TabsTrigger>
          <TabsTrigger value="trend">מגמה חודשית</TabsTrigger>
        </TabsList>

        {/* ── tab 1: cost per delivery ──────────────────────────── */}
        <TabsContent value="deliveries">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base">עלות לפי משלוח — 12 משלוחים אחרונים</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">יעד</TableHead>
                    <TableHead className="text-right">מרחק (ק"מ)</TableHead>
                    <TableHead className="text-right">רכב</TableHead>
                    <TableHead className="text-right">נהג</TableHead>
                    <TableHead className="text-right">דלק</TableHead>
                    <TableHead className="text-right">נהג</TableHead>
                    <TableHead className="text-right">מנוף</TableHead>
                    <TableHead className="text-right">אגרות</TableHead>
                    <TableHead className="text-right">סה"כ</TableHead>
                    <TableHead className="text-right">₪/ק"מ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell className="font-mono text-blue-400">{d.id}</TableCell>
                      <TableCell>{d.project}</TableCell>
                      <TableCell>{d.destination}</TableCell>
                      <TableCell>{d.km}</TableCell>
                      <TableCell className="font-mono text-xs">{d.vehicle}</TableCell>
                      <TableCell>{d.driver}</TableCell>
                      <TableCell>{nis(d.fuel)}</TableCell>
                      <TableCell>{nis(d.driverCost)}</TableCell>
                      <TableCell>{d.crane > 0 ? nis(d.crane) : <span className="text-gray-600">—</span>}</TableCell>
                      <TableCell>{nis(d.tolls)}</TableCell>
                      <TableCell className="font-bold text-white">{nis(d.total)}</TableCell>
                      <TableCell className="text-cyan-400">{`₪${(d.total / d.km).toFixed(1)}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── tab 2: cost by vehicle ────────────────────────────── */}
        <TabsContent value="vehicles">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base">השוואת עלויות לפי רכב — 8 כלי רכב</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">לוחית רישוי</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">עלות כוללת</TableHead>
                    <TableHead className="text-right">משלוחים</TableHead>
                    <TableHead className="text-right">עלות ממוצעת למשלוח</TableHead>
                    <TableHead className="text-right w-48">יחסי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicleCosts.map((v) => {
                    const maxAvg = Math.max(...vehicleCosts.map(x => x.avgCost));
                    const pctBar = (v.avgCost / maxAvg) * 100;
                    return (
                      <TableRow key={v.plate} className="border-gray-800 hover:bg-gray-800/50">
                        <TableCell className="font-mono text-blue-400">{v.plate}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-gray-700">{v.type}</Badge>
                        </TableCell>
                        <TableCell className="font-bold">{nis(v.totalCost)}</TableCell>
                        <TableCell>{v.deliveries}</TableCell>
                        <TableCell className="font-bold text-white">{nis(v.avgCost)}</TableCell>
                        <TableCell>
                          <Progress value={pctBar} className="h-2" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── tab 3: cost by region ─────────────────────────────── */}
        <TabsContent value="regions">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base">עלות לפי אזור גיאוגרפי</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {regions.map((r) => (
                  <Card key={r.name} className="bg-gray-800 border-gray-700">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="font-bold text-white">{r.name}</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">משלוחים</span>
                          <span className="font-bold">{r.deliveries}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">מרחק ממוצע</span>
                          <span>{r.avgKm} ק"מ</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">עלות ממוצעת</span>
                          <span className="font-bold text-amber-400">{nis(r.avgCost)}</span>
                        </div>
                      </div>
                      <Progress value={(r.deliveries / maxRegionDeliveries) * 100} className="h-2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── tab 4: internal vs external ───────────────────────── */}
        <TabsContent value="comparison">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base">השוואת עלות — צי פנימי מול מיקור חוץ</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">קטגוריה</TableHead>
                    <TableHead className="text-right">עלות פנימית</TableHead>
                    <TableHead className="text-right">הצעת מחיר חיצונית</TableHead>
                    <TableHead className="text-right">חיסכון (₪)</TableHead>
                    <TableHead className="text-right">חיסכון (%)</TableHead>
                    <TableHead className="text-right w-40">יתרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisons.map((c) => (
                    <TableRow key={c.category} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell className="font-medium">{c.category}</TableCell>
                      <TableCell className="text-emerald-400 font-bold">{nis(c.internal)}</TableCell>
                      <TableCell className="text-red-400">{nis(c.external)}</TableCell>
                      <TableCell className="text-green-400 font-bold">{nis(c.savings)}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-500/20 text-green-400">{pct(c.savingsPct)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Progress value={Math.abs(c.savingsPct)} className="h-2" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-300 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                <span>סה"כ חיסכון שנתי משוער בשימוש בצי פנימי: <strong>{nis(142800)}</strong> (כ-22% מול הצעות חיצוניות)</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── tab 5: monthly trend ──────────────────────────────── */}
        <TabsContent value="trend">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base">מגמת עלויות — 6 חודשים אחרונים</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">חודש</TableHead>
                    <TableHead className="text-right">עלות כוללת</TableHead>
                    <TableHead className="text-right">משלוחים</TableHead>
                    <TableHead className="text-right">עלות ממוצעת</TableHead>
                    <TableHead className="text-right">שינוי</TableHead>
                    <TableHead className="text-right w-48">נפח יחסי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTrend.map((m) => {
                    const maxCost = Math.max(...monthlyTrend.map(x => x.totalCost));
                    const barPct = (m.totalCost / maxCost) * 100;
                    return (
                      <TableRow key={m.month} className="border-gray-800 hover:bg-gray-800/50">
                        <TableCell className="font-medium">{m.month}</TableCell>
                        <TableCell className="font-bold text-white">{nis(m.totalCost)}</TableCell>
                        <TableCell>{m.deliveries}</TableCell>
                        <TableCell>{nis(m.avgCost)}</TableCell>
                        <TableCell>
                          {m.change === 0 ? (
                            <span className="text-gray-500">—</span>
                          ) : m.change < 0 ? (
                            <span className="flex items-center gap-1 text-green-400">
                              <ArrowDownRight className="h-3 w-3" />
                              {Math.abs(m.change)}%
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400">
                              <ArrowUpRight className="h-3 w-3" />
                              {m.change}%
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Progress value={barPct} className="h-2" />
                        </TableCell>
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
