import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Recycle, Package,
} from "lucide-react";

const fmt = (v: number) => v.toLocaleString("he-IL");
const fmtCurrency = (v: number) => `₪${fmt(v)}`;
const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/* ─── Static Data ─── */

const FALLBACK_KPIS = [
  { label: 'סה"כ הוצאות חומרי גלם', value: 2_847_500, icon: DollarSign, color: "from-blue-600 to-blue-800" },
  { label: "שינוי עלות ממוצע", value: 4.7, icon: TrendingUp, color: "from-amber-600 to-amber-800", isPct: true },
  { label: "פריט עם עלייה גבוהה", value: "פלדה אל-חלד 304", icon: AlertTriangle, color: "from-red-600 to-red-800", isText: true },
  { label: "פוטנציאל חיסכון", value: 189_200, icon: DollarSign, color: "from-emerald-600 to-emerald-800" },
  { label: "עלות פסולת", value: 127_400, icon: Package, color: "from-rose-600 to-rose-800" },
  { label: "ערך שחזור גרוטאות", value: 43_600, icon: Recycle, color: "from-cyan-600 to-cyan-800" },
];

const FALLBACK_CATEGORY_DATA = [
  { name: "מתכות", spend: 1_124_000, pct: 39.5 },
  { name: "פולימרים ופלסטיק", spend: 498_200, pct: 17.5 },
  { name: "רכיבים אלקטרוניים", spend: 384_600, pct: 13.5 },
  { name: "חומרי הלחמה וריתוך", spend: 256_800, pct: 9.0 },
  { name: "חומרים כימיים", spend: 213_500, pct: 7.5 },
  { name: "דבקים ואיטמים", spend: 142_300, pct: 5.0 },
  { name: "אריזה", spend: 128_100, pct: 4.5 },
  { name: 'חומ"ס ושונות', spend: 100_000, pct: 3.5 },
];

const FALLBACK_PRICE_COMPARISON = [
  { item: "פלדה אל-חלד 304", unit: "ק\"ג", sup1: "מתכות הצפון", p1: 38.5, sup2: "פלדות ישראל", p2: 41.2, sup3: "Steel-Pro", p3: 40.0 },
  { item: "אלומיניום 6061", unit: "ק\"ג", sup1: "מתכות הצפון", p1: 28.0, sup2: "אלו-מט", p2: 26.5, sup3: "Metal-X", p3: 29.3 },
  { item: "נחושת C110", unit: "ק\"ג", sup1: "קופר-טק", p1: 64.0, sup2: "מתכות הדרום", p2: 67.5, sup3: "פלדות ישראל", p3: 65.8 },
  { item: "ABS גרנולט", unit: "ק\"ג", sup1: "פולי-כם", p1: 14.2, sup2: "פלסטיק פלוס", p2: 13.8, sup3: "כימיקלים בע\"מ", p3: 15.0 },
  { item: 'לוח PCB דו"צ', unit: "יח'", sup1: "אלקטרו-בורד", p1: 8.5, sup2: "PCB-Tech", p2: 9.2, sup3: "סיני ישיר", p3: 6.8 },
  { item: "בדיל הלחמה 60/40", unit: "ק\"ג", sup1: "סולדר-פרו", p1: 112.0, sup2: "ריתוך בע\"מ", p2: 108.5, sup3: "Weld-X", p3: 115.0 },
  { item: "אפוקסי תעשייתי", unit: "ליטר", sup1: "כימיקלים בע\"מ", p1: 86.0, sup2: "דבק-טק", p2: 82.0, sup3: "אדהזיב פלוס", p3: 89.5 },
  { item: "ניילון PA6", unit: "ק\"ג", sup1: "פולי-כם", p1: 22.0, sup2: "פלסטיק פלוס", p2: 21.3, sup3: "נילון-X", p3: 23.8 },
  { item: "חוט ריתוך MIG", unit: "ק\"ג", sup1: "ריתוך בע\"מ", p1: 32.0, sup2: "Weld-X", p2: 34.5, sup3: "סולדר-פרו", p3: 31.0 },
];

const FALLBACK_TREND_DATA = [
  { item: "פלדה אל-חלד 304", oct: 34.2, nov: 35.0, dec: 36.1, jan: 37.0, feb: 37.8, mar: 38.5, change: 12.6 },
  { item: "אלומיניום 6061", oct: 27.0, nov: 26.5, dec: 27.2, jan: 27.8, feb: 28.0, mar: 28.0, change: 3.7 },
  { item: "נחושת C110", oct: 68.0, nov: 66.5, dec: 65.0, jan: 64.8, feb: 64.2, mar: 64.0, change: -5.9 },
  { item: "ABS גרנולט", oct: 13.5, nov: 13.8, dec: 14.0, jan: 14.0, feb: 14.1, mar: 14.2, change: 5.2 },
  { item: 'לוח PCB דו"צ', oct: 8.0, nov: 8.2, dec: 8.3, jan: 8.4, feb: 8.5, mar: 8.5, change: 6.3 },
  { item: "בדיל הלחמה 60/40", oct: 105.0, nov: 107.0, dec: 108.0, jan: 110.0, feb: 111.0, mar: 112.0, change: 6.7 },
  { item: "אפוקסי תעשייתי", oct: 88.0, nov: 87.0, dec: 86.5, jan: 86.0, feb: 86.0, mar: 86.0, change: -2.3 },
  { item: "ניילון PA6", oct: 21.0, nov: 21.2, dec: 21.5, jan: 21.8, feb: 22.0, mar: 22.0, change: 4.8 },
  { item: "חוט ריתוך MIG", oct: 30.0, nov: 30.5, dec: 31.0, jan: 31.5, feb: 31.8, mar: 32.0, change: 6.7 },
];

const FALLBACK_WASTE_DATA = [
  { material: "פלדה אל-חלד 304", wastePct: 8.2, wasteKg: 3_280, scrapValue: 18_700, netCost: 105_900 },
  { material: "אלומיניום 6061", wastePct: 6.5, wasteKg: 1_950, scrapValue: 9_200, netCost: 45_400 },
  { material: "נחושת C110", wastePct: 4.8, wasteKg: 480, scrapValue: 8_640, netCost: 22_100 },
  { material: "ABS גרנולט", wastePct: 12.0, wasteKg: 2_400, scrapValue: 2_160, netCost: 31_800 },
  { material: 'לוח PCB דו"צ', wastePct: 3.2, wasteKg: 160, scrapValue: 0, netCost: 1_360 },
  { material: "בדיל הלחמה 60/40", wastePct: 2.1, wasteKg: 42, scrapValue: 1_890, netCost: 2_814 },
  { material: "אפוקסי תעשייתי", wastePct: 5.5, wasteKg: 275, scrapValue: 0, netCost: 23_650 },
  { material: "ניילון PA6", wastePct: 9.8, wasteKg: 1_470, scrapValue: 3_010, netCost: 29_330 },
  { material: "חוט ריתוך MIG", wastePct: 1.5, wasteKg: 75, scrapValue: 0, netCost: 2_400 },
];

const months6 = ["אוק'", "נוב'", "דצמ'", "ינו'", "פבר'", "מרץ"];

export default function CostAnalysis() {
  const { data: costanalysisData } = useQuery({
    queryKey: ["cost-analysis"],
    queryFn: () => authFetch("/api/procurement/cost_analysis"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = costanalysisData ?? FALLBACK_KPIS;
  const categoryData = FALLBACK_CATEGORY_DATA;
  const priceComparison = FALLBACK_PRICE_COMPARISON;
  const trendData = FALLBACK_TREND_DATA;
  const wasteData = FALLBACK_WASTE_DATA;

  const [tab, setTab] = useState("categories");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold text-foreground">ניתוח עלויות חומרי גלם</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className={`bg-gradient-to-br ${k.color} border-white/10`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70">{k.label}</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {k.isText ? k.value : k.isPct ? fmtPct(k.value as number) : fmtCurrency(k.value as number)}
                </p>
              </div>
              <k.icon className="w-8 h-8 text-white/30" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 mb-4">
          <TabsTrigger value="categories">עלויות לפי קטגוריה</TabsTrigger>
          <TabsTrigger value="comparison">השוואת מחירים</TabsTrigger>
          <TabsTrigger value="trends">מגמות</TabsTrigger>
          <TabsTrigger value="waste">פסולת ועלות</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Category Spend ─── */}
        <TabsContent value="categories">
          <Card className="border-border/50 bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">התפלגות עלויות לפי קטגוריית חומר</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoryData.map((c, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground font-medium">{c.name}</span>
                    <span className="text-gray-400">{fmtCurrency(c.spend)} ({c.pct}%)</span>
                  </div>
                  <Progress value={c.pct} className="h-3" />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Price Comparison ─── */}
        <TabsContent value="comparison">
          <Card className="border-border/50 bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">השוואת מחירי ספקים לפי פריט</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="text-right">פריט</TableHead>
                      <TableHead className="text-right">יחידה</TableHead>
                      <TableHead className="text-right">ספק 1</TableHead>
                      <TableHead className="text-center">מחיר</TableHead>
                      <TableHead className="text-right">ספק 2</TableHead>
                      <TableHead className="text-center">מחיר</TableHead>
                      <TableHead className="text-right">ספק 3</TableHead>
                      <TableHead className="text-center">מחיר</TableHead>
                      <TableHead className="text-center">הזול ביותר</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceComparison.map((r, i) => {
                      const minP = Math.min(r.p1, r.p2, r.p3);
                      const best = minP === r.p1 ? r.sup1 : minP === r.p2 ? r.sup2 : r.sup3;
                      return (
                        <TableRow key={i} className="border-border/30 hover:bg-muted/40">
                          <TableCell className="font-medium text-foreground">{r.item}</TableCell>
                          <TableCell className="text-gray-400">{r.unit}</TableCell>
                          <TableCell className="text-gray-300">{r.sup1}</TableCell>
                          <TableCell className={`text-center ${r.p1 === minP ? "text-green-400 font-bold" : "text-gray-400"}`}>₪{r.p1.toFixed(1)}</TableCell>
                          <TableCell className="text-gray-300">{r.sup2}</TableCell>
                          <TableCell className={`text-center ${r.p2 === minP ? "text-green-400 font-bold" : "text-gray-400"}`}>₪{r.p2.toFixed(1)}</TableCell>
                          <TableCell className="text-gray-300">{r.sup3}</TableCell>
                          <TableCell className={`text-center ${r.p3 === minP ? "text-green-400 font-bold" : "text-gray-400"}`}>₪{r.p3.toFixed(1)}</TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{best}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 3: Cost Trends (6 months) ─── */}
        <TabsContent value="trends">
          <Card className="border-border/50 bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">מגמות מחירים - 6 חודשים אחרונים (₪ ליחידה)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="text-right">חומר</TableHead>
                      {months6.map(m => (
                        <TableHead key={m} className="text-center">{m}</TableHead>
                      ))}
                      <TableHead className="text-center">שינוי %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trendData.map((r, i) => (
                      <TableRow key={i} className="border-border/30 hover:bg-muted/40">
                        <TableCell className="font-medium text-foreground whitespace-nowrap">{r.item}</TableCell>
                        <TableCell className="text-center text-gray-400">{r.oct.toFixed(1)}</TableCell>
                        <TableCell className="text-center text-gray-400">{r.nov.toFixed(1)}</TableCell>
                        <TableCell className="text-center text-gray-400">{r.dec.toFixed(1)}</TableCell>
                        <TableCell className="text-center text-gray-400">{r.jan.toFixed(1)}</TableCell>
                        <TableCell className="text-center text-gray-400">{r.feb.toFixed(1)}</TableCell>
                        <TableCell className="text-center text-gray-300 font-medium">{r.mar.toFixed(1)}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={r.change >= 0
                            ? "bg-red-500/20 text-red-400 border-red-500/30"
                            : "bg-green-500/20 text-green-400 border-green-500/30"}>
                            <span className="flex items-center gap-1">
                              {r.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {fmtPct(r.change)}
                            </span>
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 4: Waste & Scrap ─── */}
        <TabsContent value="waste">
          <Card className="border-border/50 bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">ניתוח פסולת וגרוטאות לפי חומר</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="text-right">חומר</TableHead>
                      <TableHead className="text-center">% פסולת</TableHead>
                      <TableHead className="text-center">פסולת (ק"ג)</TableHead>
                      <TableHead className="text-center">ערך גרוטאות</TableHead>
                      <TableHead className="text-center">עלות פסולת נטו</TableHead>
                      <TableHead className="text-center">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wasteData.map((r, i) => (
                      <TableRow key={i} className="border-border/30 hover:bg-muted/40">
                        <TableCell className="font-medium text-foreground whitespace-nowrap">{r.material}</TableCell>
                        <TableCell className="text-center">
                          <span className={r.wastePct > 8 ? "text-red-400" : r.wastePct > 5 ? "text-amber-400" : "text-green-400"}>
                            {r.wastePct}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-gray-400">{fmt(r.wasteKg)}</TableCell>
                        <TableCell className="text-center text-cyan-400">{fmtCurrency(r.scrapValue)}</TableCell>
                        <TableCell className="text-center text-rose-400 font-medium">{fmtCurrency(r.netCost)}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={
                            r.wastePct > 8
                              ? "bg-red-500/20 text-red-400 border-red-500/30"
                              : r.wastePct > 5
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                : "bg-green-500/20 text-green-400 border-green-500/30"
                          }>
                            {r.wastePct > 8 ? "חריג" : r.wastePct > 5 ? "לבדיקה" : "תקין"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Summary row */}
              <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-6 text-sm">
                <div className="text-gray-400">
                  סה"כ פסולת: <span className="text-foreground font-bold">{fmt(wasteData.reduce((s, r) => s + r.wasteKg, 0))} ק"ג</span>
                </div>
                <div className="text-gray-400">
                  סה"כ ערך שחזור: <span className="text-cyan-400 font-bold">{fmtCurrency(wasteData.reduce((s, r) => s + r.scrapValue, 0))}</span>
                </div>
                <div className="text-gray-400">
                  סה"כ עלות נטו: <span className="text-rose-400 font-bold">{fmtCurrency(wasteData.reduce((s, r) => s + r.netCost, 0))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
