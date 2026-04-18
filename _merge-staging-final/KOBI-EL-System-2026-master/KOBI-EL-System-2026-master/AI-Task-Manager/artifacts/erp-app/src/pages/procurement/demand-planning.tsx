import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, Package, CalendarClock, BarChart3, ShoppingCart,
  AlertTriangle, CheckCircle, Snowflake, Sun, Leaf, CloudRain,
  ArrowUpRight, ArrowDownRight, ClipboardList, Layers
} from "lucide-react";

const API = "/api";

const fmt = (v: number) => v.toLocaleString("he-IL");
const fmtC = (v: number) => "₪" + fmt(v);

const FALLBACK_KPIS = [
  { label: "פריטים להזמנה מחדש", value: 14, icon: ShoppingCart, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "דיוק תחזית", value: "91.3%", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "פריטים בשיא עונתי", value: 6, icon: Sun, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "ביקוש מבוסס פרויקטים", value: "₪1,280,000", icon: ClipboardList, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "צריכה חודשית ממוצעת", value: "₪342,000", icon: BarChart3, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "כיסוי מלאי בטחון (ימים)", value: 18, icon: Layers, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

const FALLBACK_FORECAST_DATA = [
  { material: "פרופיל אלומיניום 6063", stock: 2400, unit: 'ק"ג', avgMonthly: 800, m1: 850, m2: 920, m3: 780, reorderDate: "2026-04-18", suggestedQty: 2500, status: "urgent" },
  { material: "זכוכית מחוסמת 10 מ\"מ", stock: 180, unit: "יח'", avgMonthly: 65, m1: 70, m2: 80, m3: 55, reorderDate: "2026-04-22", suggestedQty: 200, status: "urgent" },
  { material: "ברגים נירוסטה M8", stock: 5000, unit: "יח'", avgMonthly: 1200, m1: 1300, m2: 1100, m3: 1250, reorderDate: "2026-05-10", suggestedQty: 4000, status: "normal" },
  { material: "סיליקון איטום שקוף", stock: 320, unit: "שפופרת", avgMonthly: 90, m1: 95, m2: 110, m3: 85, reorderDate: "2026-04-25", suggestedQty: 300, status: "warning" },
  { material: "צבע אפוקסי RAL 9016", stock: 45, unit: "ליטר", avgMonthly: 20, m1: 22, m2: 18, m3: 25, reorderDate: "2026-05-15", suggestedQty: 60, status: "normal" },
  { material: "פרופיל PVC 70 מ\"מ", stock: 1100, unit: "מטר", avgMonthly: 350, m1: 380, m2: 420, m3: 310, reorderDate: "2026-04-28", suggestedQty: 1200, status: "warning" },
  { material: "ידיות אלומיניום דגם 200", stock: 85, unit: "יח'", avgMonthly: 30, m1: 35, m2: 40, m3: 28, reorderDate: "2026-05-20", suggestedQty: 100, status: "normal" },
  { material: "גומיות איטום EPDM", stock: 600, unit: "מטר", avgMonthly: 250, m1: 260, m2: 300, m3: 220, reorderDate: "2026-04-20", suggestedQty: 800, status: "urgent" },
  { material: "רשת יתושים פיברגלס", stock: 150, unit: "מ\"ר", avgMonthly: 40, m1: 55, m2: 70, m3: 35, reorderDate: "2026-05-05", suggestedQty: 200, status: "warning" },
];

const FALLBACK_CONSUMPTION_DATA = [
  { material: "פרופיל אלומיניום 6063", unit: 'ק"ג', months: [780, 820, 750, 830, 810, 800], trend: "up" },
  { material: "זכוכית מחוסמת 10 מ\"מ", unit: "יח'", months: [55, 60, 58, 70, 68, 65], trend: "up" },
  { material: "ברגים נירוסטה M8", unit: "יח'", months: [1100, 1250, 1180, 1300, 1150, 1200], trend: "stable" },
  { material: "סיליקון איטום שקוף", unit: "שפופרת", months: [80, 85, 92, 88, 95, 90], trend: "up" },
  { material: "צבע אפוקסי RAL 9016", unit: "ליטר", months: [18, 22, 20, 19, 21, 20], trend: "stable" },
  { material: "פרופיל PVC 70 מ\"מ", unit: "מטר", months: [310, 340, 360, 380, 350, 350], trend: "up" },
  { material: "ידיות אלומיניום דגם 200", unit: "יח'", months: [28, 32, 30, 35, 33, 30], trend: "stable" },
  { material: "גומיות איטום EPDM", unit: "מטר", months: [220, 240, 260, 250, 270, 250], trend: "up" },
  { material: "רשת יתושים פיברגלס", unit: "מ\"ר", months: [20, 25, 30, 45, 55, 40], trend: "up" },
];

const monthLabels = ["נוב'", "דצמ'", "ינו'", "פבר'", "מרץ", "אפר'"];

const FALLBACK_SEASONAL_DATA = [
  { category: "אלומיניום", q1: 85, q2: 110, q3: 95, q4: 70, peak: "Q2", peakLabel: "אביב-קיץ", factor: 1.29 },
  { category: "זכוכית", q1: 75, q2: 105, q3: 100, q4: 65, peak: "Q2", peakLabel: "אביב-קיץ", factor: 1.40 },
  { category: "PVC", q1: 90, q2: 115, q3: 90, q4: 60, peak: "Q2", peakLabel: "אביב-קיץ", factor: 1.28 },
  { category: "איטום", q1: 70, q2: 80, q3: 120, q4: 110, peak: "Q3", peakLabel: "קיץ-סתיו", factor: 1.50 },
  { category: "צבעים", q1: 80, q2: 100, q3: 110, q4: 60, peak: "Q3", peakLabel: "קיץ-סתיו", factor: 1.38 },
  { category: "אביזרים", q1: 90, q2: 105, q3: 95, q4: 75, peak: "Q2", peakLabel: "אביב-קיץ", factor: 1.17 },
  { category: "רשתות", q1: 50, q2: 130, q3: 140, q4: 30, peak: "Q3", peakLabel: "קיץ", factor: 2.80 },
  { category: "נירוסטה", q1: 95, q2: 100, q3: 100, q4: 90, peak: "Q2", peakLabel: "יציב", factor: 1.05 },
];

const seasonIcons: Record<string, any> = { Q1: CloudRain, Q2: Leaf, Q3: Sun, Q4: Snowflake };
const seasonColors: Record<string, string> = { Q1: "text-blue-400", Q2: "text-green-400", Q3: "text-amber-400", Q4: "text-cyan-400" };

const FALLBACK_PROJECT_DEMAND = [
  { project: "מגדל הים TLV-42", materials: "אלומיניום, זכוכית, איטום", qty: "₪480,000", start: "2026-04-15", end: "2026-07-30", status: "active", priority: "high" },
  { project: "פרויקט מגורים הרצליה B", materials: "PVC, זכוכית, רשתות", qty: "₪320,000", start: "2026-05-01", end: "2026-09-15", status: "planned", priority: "high" },
  { project: "שיפוץ מלון ים המלח", materials: "אלומיניום, צבע, אביזרים", qty: "₪185,000", start: "2026-04-20", end: "2026-06-10", status: "active", priority: "medium" },
  { project: "בנייני משרדים ר\"ג", materials: "אלומיניום, זכוכית, נירוסטה", qty: "₪210,000", start: "2026-06-01", end: "2026-10-30", status: "planned", priority: "medium" },
  { project: "מרכז מסחרי באר שבע", materials: "PVC, אלומיניום, איטום", qty: "₪145,000", start: "2026-05-15", end: "2026-08-20", status: "planned", priority: "low" },
  { project: "בית ספר חדש נתניה", materials: "PVC, רשתות, אביזרים", qty: "₪92,000", start: "2026-04-10", end: "2026-05-30", status: "active", priority: "medium" },
  { project: "וילות פרטיות קיסריה", materials: "אלומיניום, זכוכית, ידיות", qty: "₪260,000", start: "2026-06-15", end: "2026-11-30", status: "planned", priority: "high" },
  { project: "מפעל תעשייתי אשדוד", materials: "אלומיניום, נירוסטה, צבע", qty: "₪128,000", start: "2026-05-20", end: "2026-07-15", status: "planned", priority: "low" },
];

const FALLBACK_REORDER_SUGGESTIONS = [
  { material: "גומיות איטום EPDM", current: 600, minReq: 750, suggestedQty: 800, supplier: "Schüco Int.", est: "₪12,800", leadDays: 7, priority: "critical" },
  { material: "פרופיל אלומיניום 6063", current: 2400, minReq: 2800, suggestedQty: 2500, supplier: "Foshan Glass", est: "₪87,500", leadDays: 21, priority: "critical" },
  { material: "זכוכית מחוסמת 10 מ\"מ", current: 180, minReq: 200, suggestedQty: 200, supplier: "Foshan Glass", est: "₪64,000", leadDays: 18, priority: "critical" },
  { material: "סיליקון איטום שקוף", current: 320, minReq: 350, suggestedQty: 300, supplier: "ספק מקומי", est: "₪5,400", leadDays: 3, priority: "high" },
  { material: "פרופיל PVC 70 מ\"מ", current: 1100, minReq: 1200, suggestedQty: 1200, supplier: "Alumil SA", est: "₪43,200", leadDays: 14, priority: "high" },
  { material: "רשת יתושים פיברגלס", current: 150, minReq: 180, suggestedQty: 200, supplier: "ספק מקומי", est: "₪3,600", leadDays: 5, priority: "medium" },
  { material: "צבע אפוקסי RAL 9016", current: 45, minReq: 50, suggestedQty: 60, supplier: "נירלט", est: "₪4,200", leadDays: 4, priority: "medium" },
  { material: "ידיות אלומיניום דגם 200", current: 85, minReq: 90, suggestedQty: 100, supplier: "Schüco Int.", est: "₪7,500", leadDays: 10, priority: "low" },
  { material: "ברגים נירוסטה M8", current: 5000, minReq: 4000, suggestedQty: 0, supplier: "-", est: "-", leadDays: 0, priority: "ok" },
];

const statusBadge = (s: string) => {
  const m: Record<string, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
    urgent: { label: "דחוף", variant: "destructive" },
    warning: { label: "אזהרה", variant: "default" },
    normal: { label: "תקין", variant: "secondary" },
    critical: { label: "קריטי", variant: "destructive" },
    high: { label: "גבוה", variant: "default" },
    medium: { label: "בינוני", variant: "secondary" },
    low: { label: "נמוך", variant: "outline" },
    ok: { label: "תקין", variant: "secondary" },
    active: { label: "פעיל", variant: "default" },
    planned: { label: "מתוכנן", variant: "secondary" },
  };
  const c = m[s] || { label: s, variant: "outline" as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
};

export default function DemandPlanning() {
  const [tab, setTab] = useState("forecast");

  const { data: apiData } = useQuery({
    queryKey: ["procurement-demand-planning"],
    queryFn: async () => {
      const res = await authFetch(`${API}/procurement/demand-planning`);
      if (!res.ok) throw new Error("Failed to fetch demand planning");
      return res.json();
    },
  });

  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const forecastData = apiData?.forecastData ?? FALLBACK_FORECAST_DATA;
  const consumptionData = apiData?.consumptionData ?? FALLBACK_CONSUMPTION_DATA;
  const seasonalData = apiData?.seasonalData ?? FALLBACK_SEASONAL_DATA;
  const projectDemand = apiData?.projectDemand ?? FALLBACK_PROJECT_DEMAND;
  const reorderSuggestions = apiData?.reorderSuggestions ?? FALLBACK_REORDER_SUGGESTIONS;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-primary" /> תכנון ביקושים
          </h1>
          <p className="text-muted-foreground text-sm mt-1">תחזיות, צריכה, עונתיות וניהול הזמנות מחדש - טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="border-border/50 bg-card/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-md ${k.bg}`}><k.icon className={`h-4 w-4 ${k.color}`} /></div>
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <div className="text-xl font-bold">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="forecast">תחזית</TabsTrigger>
          <TabsTrigger value="consumption">צריכה</TabsTrigger>
          <TabsTrigger value="seasonal">עונתיות</TabsTrigger>
          <TabsTrigger value="projects">פרויקטים</TabsTrigger>
          <TabsTrigger value="reorder">המלצות</TabsTrigger>
        </TabsList>

        {/* Forecast Tab */}
        <TabsContent value="forecast">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" /> תחזית ביקוש 3 חודשים קדימה</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חומר</TableHead>
                    <TableHead className="text-center">מלאי נוכחי</TableHead>
                    <TableHead className="text-center">צריכה חודשית ממוצעת</TableHead>
                    <TableHead className="text-center">אפר' 26</TableHead>
                    <TableHead className="text-center">מאי 26</TableHead>
                    <TableHead className="text-center">יוני 26</TableHead>
                    <TableHead className="text-center">תאריך הזמנה</TableHead>
                    <TableHead className="text-center">כמות מוצעת</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecastData.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-right">{r.material}</TableCell>
                      <TableCell className="text-center">{fmt(r.stock)} {r.unit}</TableCell>
                      <TableCell className="text-center">{fmt(r.avgMonthly)} {r.unit}</TableCell>
                      <TableCell className="text-center">{fmt(r.m1)}</TableCell>
                      <TableCell className="text-center">{fmt(r.m2)}</TableCell>
                      <TableCell className="text-center">{fmt(r.m3)}</TableCell>
                      <TableCell className="text-center">{r.reorderDate}</TableCell>
                      <TableCell className="text-center font-semibold">{fmt(r.suggestedQty)} {r.unit}</TableCell>
                      <TableCell className="text-center">{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Consumption Tab */}
        <TabsContent value="consumption">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" /> היסטוריית צריכה - 6 חודשים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חומר</TableHead>
                    {monthLabels.map((m, i) => <TableHead key={i} className="text-center">{m}</TableHead>)}
                    <TableHead className="text-center">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumptionData.map((r, i) => {
                    const max = Math.max(...r.months);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-right">{r.material}</TableCell>
                        {r.months.map((v, j) => (
                          <TableCell key={j} className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-sm">{fmt(v)}</span>
                              <Progress value={(v / max) * 100} className="h-1.5 w-16" />
                            </div>
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          {r.trend === "up" ? <ArrowUpRight className="h-4 w-4 text-red-400 mx-auto" /> :
                           r.trend === "down" ? <ArrowDownRight className="h-4 w-4 text-green-400 mx-auto" /> :
                           <span className="text-xs text-muted-foreground">יציב</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Seasonal Tab */}
        <TabsContent value="seasonal">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Sun className="h-5 w-5" /> תבניות עונתיות לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קטגוריה</TableHead>
                    <TableHead className="text-center">Q1 (ינו-מרץ)</TableHead>
                    <TableHead className="text-center">Q2 (אפר-יוני)</TableHead>
                    <TableHead className="text-center">Q3 (יולי-ספט)</TableHead>
                    <TableHead className="text-center">Q4 (אוק-דצמ)</TableHead>
                    <TableHead className="text-center">שיא</TableHead>
                    <TableHead className="text-center">מכפיל עונתי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seasonalData.map((r, i) => {
                    const SeasonIcon = seasonIcons[r.peak];
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-right">{r.category}</TableCell>
                        {[r.q1, r.q2, r.q3, r.q4].map((v, j) => {
                          const qKey = `Q${j + 1}`;
                          const isMax = qKey === r.peak;
                          return (
                            <TableCell key={j} className="text-center">
                              <div className={`flex flex-col items-center gap-1 ${isMax ? "font-bold" : ""}`}>
                                <span className={isMax ? "text-amber-400" : ""}>{v}%</span>
                                <Progress value={v} className="h-1.5 w-16" />
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {SeasonIcon && <SeasonIcon className={`h-4 w-4 ${seasonColors[r.peak]}`} />}
                            <span className="text-xs">{r.peakLabel}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-semibold">x{r.factor.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><ClipboardList className="h-5 w-5" /> ביקוש מבוסס פרויקטים</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">חומרים נדרשים</TableHead>
                    <TableHead className="text-center">עלות משוערת</TableHead>
                    <TableHead className="text-center">תאריך התחלה</TableHead>
                    <TableHead className="text-center">תאריך סיום</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-center">עדיפות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectDemand.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-right">{r.project}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{r.materials}</TableCell>
                      <TableCell className="text-center font-semibold">{r.qty}</TableCell>
                      <TableCell className="text-center">{r.start}</TableCell>
                      <TableCell className="text-center">{r.end}</TableCell>
                      <TableCell className="text-center">{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-center">{statusBadge(r.priority)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reorder Suggestions Tab */}
        <TabsContent value="reorder">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> המלצות הזמנה מחדש</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חומר</TableHead>
                    <TableHead className="text-center">מלאי נוכחי</TableHead>
                    <TableHead className="text-center">מינימום נדרש</TableHead>
                    <TableHead className="text-center">כמות מוצעת</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-center">עלות משוערת</TableHead>
                    <TableHead className="text-center">זמן אספקה</TableHead>
                    <TableHead className="text-center">עדיפות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorderSuggestions.map((r, i) => (
                    <TableRow key={i} className={r.priority === "critical" ? "bg-red-500/5" : r.priority === "ok" ? "bg-green-500/5" : ""}>
                      <TableCell className="font-medium text-right">{r.material}</TableCell>
                      <TableCell className="text-center">{fmt(r.current)}</TableCell>
                      <TableCell className="text-center">{fmt(r.minReq)}</TableCell>
                      <TableCell className="text-center font-semibold">{r.suggestedQty > 0 ? fmt(r.suggestedQty) : "-"}</TableCell>
                      <TableCell className="text-right">{r.supplier}</TableCell>
                      <TableCell className="text-center">{r.est}</TableCell>
                      <TableCell className="text-center">{r.leadDays > 0 ? `${r.leadDays} ימים` : "-"}</TableCell>
                      <TableCell className="text-center">{statusBadge(r.priority)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
