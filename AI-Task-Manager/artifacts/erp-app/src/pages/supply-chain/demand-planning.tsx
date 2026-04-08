import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TrendingUp, Target, BarChart3, Package, ShieldCheck, AlertTriangle,
  Brain, Calendar, ArrowUpDown, Factory, Layers, ClipboardList
} from "lucide-react";

const kpis = [
  { label: "דיוק תחזית", value: "91.4%", delta: "+2.1%", icon: Target, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "ביקוש החודש", value: "12,840", unit: "יח'", icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "ניצולת קיבולת ייצור", value: "87%", delta: "+5%", icon: Factory, color: "text-violet-600", bg: "bg-violet-50" },
  { label: "כיסוי מלאי בטחון", value: "18", unit: "ימים", icon: ShieldCheck, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "הזמנות מתוכננות", value: "34", unit: "פעילות", icon: ClipboardList, color: "text-cyan-600", bg: "bg-cyan-50" },
  { label: "סטייה תחזית/בפועל", value: "4.8%", delta: "-1.2%", icon: ArrowUpDown, color: "text-red-600", bg: "bg-red-50" },
];

const forecastData = [
  { id: "ALW-100", name: "חלון אלומיניום סטנדרט", apr: 420, may: 380, jun: 450, seasonal: 1.12, growth: 8.5, confidence: 94, method: "AI" },
  { id: "ALW-200", name: "חלון אלומיניום מבודד", apr: 310, may: 290, jun: 340, seasonal: 1.08, growth: 12.0, confidence: 91, method: "AI" },
  { id: "GLP-300", name: "פנל זכוכית מחוסמת", apr: 580, may: 620, jun: 700, seasonal: 1.18, growth: 15.2, confidence: 88, method: "AI" },
  { id: "GLP-310", name: "זכוכית שקופה 6 מ\"מ", apr: 890, may: 850, jun: 920, seasonal: 1.05, growth: 4.3, confidence: 92, method: "היסטורי" },
  { id: "STD-400", name: "דלת פלדה מעוצבת", apr: 145, may: 160, jun: 175, seasonal: 1.15, growth: 10.8, confidence: 86, method: "AI" },
  { id: "STD-410", name: "דלת פלדה חסינת אש", apr: 85, may: 90, jun: 95, seasonal: 1.02, growth: 6.1, confidence: 90, method: "היסטורי" },
  { id: "ALF-500", name: "מסגרת אלומיניום 40x60", apr: 1200, may: 1150, jun: 1300, seasonal: 1.10, growth: 7.4, confidence: 93, method: "AI" },
  { id: "ALF-510", name: "פרופיל אלומיניום תרמי", apr: 960, may: 900, jun: 1020, seasonal: 1.09, growth: 9.2, confidence: 89, method: "ידני" },
  { id: "GLP-320", name: "זכוכית למינציה בטיחותית", apr: 340, may: 370, jun: 410, seasonal: 1.14, growth: 13.5, confidence: 87, method: "AI" },
  { id: "ACC-600", name: "ידית חלון נירוסטה", apr: 2100, may: 2000, jun: 2250, seasonal: 1.06, growth: 5.0, confidence: 95, method: "היסטורי" },
  { id: "ACC-610", name: "ציר כבד 120 ק\"ג", apr: 780, may: 750, jun: 820, seasonal: 1.04, growth: 3.8, confidence: 94, method: "היסטורי" },
  { id: "SLR-700", name: "תריס אלומיניום חשמלי", apr: 210, may: 230, jun: 260, seasonal: 1.20, growth: 18.5, confidence: 82, method: "AI" },
];

const mrpData = [
  { product: "חלון אלומיניום סטנדרט", component: "פרופיל AL-6063", needed: 1680, available: 1200, shortfall: 480, poQty: 500, leadTime: 14, reqDate: "2026-04-22" },
  { product: "חלון אלומיניום סטנדרט", component: "זכוכית 5 מ\"מ", needed: 840, available: 900, shortfall: 0, poQty: 0, leadTime: 10, reqDate: "-" },
  { product: "פנל זכוכית מחוסמת", component: "זכוכית גולמית 8 מ\"מ", needed: 1160, available: 600, shortfall: 560, poQty: 600, leadTime: 21, reqDate: "2026-04-18" },
  { product: "פנל זכוכית מחוסמת", component: "PVB שכבת ביניים", needed: 2320, available: 1800, shortfall: 520, poQty: 600, leadTime: 18, reqDate: "2026-04-20" },
  { product: "דלת פלדה מעוצבת", component: "פלדה מגולוונת 1.5 מ\"מ", needed: 580, available: 400, shortfall: 180, poQty: 200, leadTime: 12, reqDate: "2026-04-25" },
  { product: "דלת פלדה מעוצבת", component: "צירים כבדים", needed: 290, available: 320, shortfall: 0, poQty: 0, leadTime: 7, reqDate: "-" },
  { product: "מסגרת אלומיניום 40x60", component: "פרופיל AL-6060", needed: 4800, available: 3200, shortfall: 1600, poQty: 1800, leadTime: 16, reqDate: "2026-04-15" },
  { product: "תריס אלומיניום חשמלי", component: "מנוע חשמלי 220V", needed: 420, available: 150, shortfall: 270, poQty: 300, leadTime: 28, reqDate: "2026-04-12" },
  { product: "תריס אלומיניום חשמלי", component: "שלט רחוק RF", needed: 420, available: 380, shortfall: 40, poQty: 100, leadTime: 14, reqDate: "2026-04-22" },
  { product: "פרופיל אלומיניום תרמי", component: "PA66 מפסק תרמי", needed: 1920, available: 1000, shortfall: 920, poQty: 1000, leadTime: 25, reqDate: "2026-04-14" },
  { product: "זכוכית למינציה בטיחותית", component: "זכוכית Float 4 מ\"מ", needed: 680, available: 700, shortfall: 0, poQty: 0, leadTime: 10, reqDate: "-" },
];

const seasonalProducts = [
  { name: "חלונות אלומיניום", peak: "אפר-יונ", months: [60, 65, 80, 100, 95, 105, 85, 70, 75, 90, 80, 55], alert: "עונת שיא מתחילה" },
  { name: "פנלי זכוכית", peak: "מאי-אוג", months: [50, 55, 65, 80, 100, 110, 105, 95, 70, 60, 55, 45], alert: "עלייה צפויה בחודש הבא" },
  { name: "דלתות פלדה", peak: "ספט-נוב", months: [70, 65, 60, 55, 50, 55, 65, 75, 100, 110, 95, 80], alert: null },
  { name: "תריסי אלומיניום", peak: "מרץ-יונ", months: [55, 70, 95, 110, 105, 100, 80, 65, 55, 50, 45, 50], alert: "שיא ביקוש עכשיו" },
  { name: "פרופילים תרמיים", peak: "אוק-דצ", months: [60, 55, 50, 45, 40, 45, 55, 70, 85, 100, 110, 90], alert: null },
];
const monthLabels = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];

const targetsData = [
  { product: "חלון אלומיניום סטנדרט", months: [
    { planned: 400, actual: 385 }, { planned: 410, actual: 420 }, { planned: 390, actual: 375 },
    { planned: 420, actual: 410 }, { planned: 380, actual: 395 }, { planned: 450, actual: 430 }
  ]},
  { product: "פנל זכוכית מחוסמת", months: [
    { planned: 550, actual: 520 }, { planned: 570, actual: 590 }, { planned: 600, actual: 580 },
    { planned: 580, actual: 560 }, { planned: 620, actual: 610 }, { planned: 700, actual: 670 }
  ]},
  { product: "דלת פלדה מעוצבת", months: [
    { planned: 130, actual: 125 }, { planned: 140, actual: 150 }, { planned: 135, actual: 130 },
    { planned: 145, actual: 140 }, { planned: 160, actual: 155 }, { planned: 175, actual: 168 }
  ]},
  { product: "מסגרת אלומיניום 40x60", months: [
    { planned: 1100, actual: 1080 }, { planned: 1150, actual: 1170 }, { planned: 1200, actual: 1150 },
    { planned: 1200, actual: 1190 }, { planned: 1150, actual: 1120 }, { planned: 1300, actual: 1260 }
  ]},
  { product: "תריס אלומיניום חשמלי", months: [
    { planned: 180, actual: 170 }, { planned: 200, actual: 195 }, { planned: 190, actual: 205 },
    { planned: 210, actual: 200 }, { planned: 230, actual: 220 }, { planned: 260, actual: 245 }
  ]},
  { product: "פרופיל אלומיניום תרמי", months: [
    { planned: 900, actual: 880 }, { planned: 920, actual: 940 }, { planned: 950, actual: 930 },
    { planned: 960, actual: 945 }, { planned: 900, actual: 910 }, { planned: 1020, actual: 985 }
  ]},
];
const targetMonthLabels = ["נוב 25", "דצמ 25", "ינו 26", "פבר 26", "מרץ 26", "אפר 26"];

function methodBadge(m: string) {
  if (m === "AI") return <Badge className="bg-purple-500/20 text-purple-700">AI</Badge>;
  if (m === "היסטורי") return <Badge className="bg-blue-500/20 text-blue-700">היסטורי</Badge>;
  return <Badge className="bg-gray-500/20 text-gray-700">ידני</Badge>;
}

function accuracy(planned: number, actual: number) {
  const pct = (1 - Math.abs(planned - actual) / planned) * 100;
  return pct.toFixed(1);
}

function accColor(val: number) {
  if (val >= 95) return "text-emerald-600";
  if (val >= 90) return "text-amber-600";
  return "text-red-600";
}

export default function DemandPlanningPage() {
  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-blue-600" />
            תכנון ביקוש ותחזיות - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח ביקושים, תחזיות ייצור ותכנון חומרים | עדכון אחרון: 08/04/2026</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Brain className="h-4 w-4 ml-1" />הרץ תחזית AI</Button>
          <Button variant="outline" size="sm"><Calendar className="h-4 w-4 ml-1" />ייצוא לאקסל</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                  <p className="text-xl font-bold">{k.value}{k.unit ? ` ${k.unit}` : ""}</p>
                  {k.delta && (
                    <span className={`text-xs font-medium ${k.delta.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>
                      {k.delta} מהחודש הקודם
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="forecast" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="forecast">תחזית ביקוש</TabsTrigger>
          <TabsTrigger value="mrp">תכנון MRP</TabsTrigger>
          <TabsTrigger value="seasonality">ניתוח עונתיות</TabsTrigger>
          <TabsTrigger value="targets">יעדים vs ביצוע</TabsTrigger>
        </TabsList>

        {/* Tab 1: Demand Forecast */}
        <TabsContent value="forecast">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                תחזית ביקוש 3 חודשים קדימה
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right w-16">מק״ט</TableHead>
                      <TableHead className="text-right">מוצר</TableHead>
                      <TableHead className="text-center">אפריל</TableHead>
                      <TableHead className="text-center">מאי</TableHead>
                      <TableHead className="text-center">יוני</TableHead>
                      <TableHead className="text-center">עונתיות</TableHead>
                      <TableHead className="text-center">מגמת צמיחה</TableHead>
                      <TableHead className="text-center">ביטחון</TableHead>
                      <TableHead className="text-center">שיטה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forecastData.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.id}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-center">{r.apr.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{r.may.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{r.jun.toLocaleString()}</TableCell>
                        <TableCell className="text-center">x{r.seasonal.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-emerald-600 font-medium">+{r.growth}%</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <Progress value={r.confidence} className="h-2 w-16" />
                            <span className="text-xs">{r.confidence}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{methodBadge(r.method)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: MRP Planning */}
        <TabsContent value="mrp">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-5 w-5 text-violet-600" />
                תכנון דרישות חומרים (MRP)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מוצר</TableHead>
                      <TableHead className="text-right">רכיב BOM</TableHead>
                      <TableHead className="text-center">נדרש</TableHead>
                      <TableHead className="text-center">במלאי</TableHead>
                      <TableHead className="text-center">חוסר</TableHead>
                      <TableHead className="text-center">כמות PO מוצעת</TableHead>
                      <TableHead className="text-center">Lead Time</TableHead>
                      <TableHead className="text-center">תאריך נדרש</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mrpData.map((r, i) => (
                      <TableRow key={i} className={r.shortfall > 0 ? "bg-red-50/50" : ""}>
                        <TableCell className="font-medium">{r.product}</TableCell>
                        <TableCell>{r.component}</TableCell>
                        <TableCell className="text-center">{r.needed.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{r.available.toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          {r.shortfall > 0 ? (
                            <Badge className="bg-red-500/20 text-red-700">{r.shortfall.toLocaleString()}</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/20 text-emerald-700">מספיק</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {r.poQty > 0 ? r.poQty.toLocaleString() : "-"}
                        </TableCell>
                        <TableCell className="text-center">{r.leadTime} ימים</TableCell>
                        <TableCell className="text-center font-mono text-sm">{r.reqDate}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 border-t flex items-center gap-4">
                <Badge className="bg-red-500/15 text-red-700 text-sm px-3 py-1">
                  <AlertTriangle className="h-3.5 w-3.5 ml-1 inline" />
                  7 פריטים עם חוסר - דרושות הזמנות דחופות
                </Badge>
                <span className="text-sm text-muted-foreground">סה״כ ערך הזמנות מוצעות: ₪184,500</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Seasonality Analysis */}
        <TabsContent value="seasonality">
          <div className="grid gap-4">
            {seasonalProducts.map((sp, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-blue-500" />
                      {sp.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">שיא: {sp.peak}</Badge>
                      {sp.alert && (
                        <Badge className="bg-amber-500/20 text-amber-700">
                          <AlertTriangle className="h-3 w-3 ml-1 inline" />{sp.alert}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1 h-24">
                    {sp.months.map((val, mi) => {
                      const isMax = val === Math.max(...sp.months);
                      return (
                        <div key={mi} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">{val}%</span>
                          <div
                            className={`w-full rounded-t transition-all ${
                              isMax ? "bg-blue-600" : val >= 90 ? "bg-blue-400" : val >= 70 ? "bg-blue-300" : "bg-blue-200"
                            }`}
                            style={{ height: `${val * 0.7}px` }}
                          />
                          <span className="text-[10px] text-muted-foreground">{monthLabels[mi]}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 4: Targets vs Actual */}
        <TabsContent value="targets">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-emerald-600" />
                יעדים מול ביצוע - 6 חודשים אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right" rowSpan={2}>מוצר</TableHead>
                      {targetMonthLabels.map((ml) => (
                        <TableHead key={ml} className="text-center border-r" colSpan={2}>{ml}</TableHead>
                      ))}
                      <TableHead className="text-center border-r">ציון דיוק</TableHead>
                    </TableRow>
                    <TableRow>
                      {targetMonthLabels.map((ml) => (
                        <>
                          <TableHead key={`${ml}-p`} className="text-center text-xs">יעד</TableHead>
                          <TableHead key={`${ml}-a`} className="text-center text-xs border-r">בפועל</TableHead>
                        </>
                      ))}
                      <TableHead className="text-center text-xs border-r">ממוצע</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {targetsData.map((row, ri) => {
                      const avgAcc = row.months.reduce((sum, m) => sum + parseFloat(accuracy(m.planned, m.actual)), 0) / row.months.length;
                      return (
                        <TableRow key={ri}>
                          <TableCell className="font-medium">{row.product}</TableCell>
                          {row.months.map((m, mi) => {
                            const acc = parseFloat(accuracy(m.planned, m.actual));
                            return (
                              <>
                                <TableCell key={`${ri}-${mi}-p`} className="text-center text-sm">{m.planned.toLocaleString()}</TableCell>
                                <TableCell key={`${ri}-${mi}-a`} className={`text-center text-sm border-r ${m.actual >= m.planned ? "text-emerald-600" : "text-red-500"}`}>
                                  {m.actual.toLocaleString()}
                                </TableCell>
                              </>
                            );
                          })}
                          <TableCell className="text-center border-r">
                            <span className={`font-bold ${accColor(avgAcc)}`}>{avgAcc.toFixed(1)}%</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 border-t flex items-center gap-6 text-sm">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span>95%+ דיוק מצוין</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                  <span>90-95% דיוק טוב</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                  <span>מתחת ל-90% דורש שיפור</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
