import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, DollarSign, Package, Truck, BarChart3,
  Clock, ShieldCheck, AlertTriangle, Search, Brain, ArrowUpRight,
  ArrowDownRight, Layers, Box, Target, Lightbulb, RefreshCw,
} from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const fmtP = (n: number) => `${n.toFixed(1)}%`;

// ── KPI data ──
const KPI_CARDS = [
  { title: "סה\"כ הוצאות רכש", value: fmtC(4_870_000), change: -3.2, icon: DollarSign, color: "text-blue-600 bg-blue-50" },
  { title: "עלות ליחידה (מגמה)", value: "₪48.2", change: -1.8, icon: TrendingDown, color: "text-green-600 bg-green-50" },
  { title: "שיעור הזמנה מושלמת", value: "94.6%", change: 2.1, icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50" },
  { title: "מחזור מזומן (ימים)", value: "38", change: -4, icon: Clock, color: "text-purple-600 bg-purple-50" },
  { title: "ימי מלאי ממוצע", value: "22", change: -2, icon: Package, color: "text-amber-600 bg-amber-50" },
  { title: "עלות שרשרת / הכנסות", value: "6.8%", change: -0.5, icon: BarChart3, color: "text-cyan-600 bg-cyan-50" },
];

// ── Performance tab data ──
const MONTHS = ["נוב׳", "דצמ׳", "ינו׳", "פבר׳", "מרץ", "אפר׳"];
const PERF_TREND = [
  { m: "נוב׳", otd: 91.2, fill: 88.5, quality: 97.1, cost: 82.0 },
  { m: "דצמ׳", otd: 92.8, fill: 90.1, quality: 97.5, cost: 83.5 },
  { m: "ינו׳", otd: 93.5, fill: 91.4, quality: 96.8, cost: 85.2 },
  { m: "פבר׳", otd: 94.1, fill: 92.0, quality: 97.9, cost: 86.0 },
  { m: "מרץ", otd: 95.0, fill: 93.5, quality: 98.2, cost: 87.4 },
  { m: "אפר׳", otd: 95.8, fill: 94.2, quality: 98.5, cost: 88.1 },
];

const SUPPLIERS = [
  { name: "אלומיניום ישראל בע\"מ", score: 96.5, otd: 98.2, quality: 99.1, category: "אלומיניום" },
  { name: "זכוכית השרון", score: 94.8, otd: 97.0, quality: 98.5, category: "זכוכית" },
  { name: "פלדות הצפון", score: 93.2, otd: 95.8, quality: 97.8, category: "פלדה" },
  { name: "כימיקלים מתקדמים", score: 91.7, otd: 94.2, quality: 98.0, category: "חומרי גלם" },
  { name: "אריזות מהדרין", score: 90.5, otd: 93.5, quality: 96.2, category: "אריזה" },
  { name: "מתכות הנגב", score: 89.8, otd: 92.8, quality: 97.5, category: "פלדה" },
  { name: "פרופילים בע\"מ", score: 88.4, otd: 91.0, quality: 96.8, category: "אלומיניום" },
  { name: "חומרי בניין דרום", score: 87.1, otd: 90.5, quality: 95.5, category: "חומרי גלם" },
  { name: "ייבוא זגוגית פלוס", score: 85.9, otd: 89.2, quality: 97.0, category: "זכוכית" },
  { name: "ברגים ומחברים ת\"א", score: 84.3, otd: 88.0, quality: 94.8, category: "מחברים" },
];

const CATEGORY_SCORES = [
  { cat: "אלומיניום", score: 92.5, suppliers: 4, trend: "up" },
  { cat: "זכוגית", score: 90.4, suppliers: 3, trend: "up" },
  { cat: "פלדה", score: 91.5, suppliers: 3, trend: "stable" },
  { cat: "חומרי גלם", score: 89.4, suppliers: 5, trend: "down" },
  { cat: "אריזה", score: 90.5, suppliers: 2, trend: "up" },
];

// ── Cost tab data ──
const SPEND_BY_CAT = [
  { cat: "חומרי גלם", amount: 2_450_000, pct: 50.3 },
  { cat: "הובלה", amount: 730_000, pct: 15.0 },
  { cat: "מכס ויבוא", amount: 535_000, pct: 11.0 },
  { cat: "אחסנה", amount: 487_000, pct: 10.0 },
  { cat: "טיפול ומשלוח", amount: 390_000, pct: 8.0 },
  { cat: "אחר", amount: 278_000, pct: 5.7 },
];

const COST_TREND = [
  { m: "נוב׳", total: 840_000, materials: 420_000, logistics: 210_000 },
  { m: "דצמ׳", total: 810_000, materials: 405_000, logistics: 200_000 },
  { m: "ינו׳", total: 795_000, materials: 398_000, logistics: 195_000 },
  { m: "פבר׳", total: 820_000, materials: 415_000, logistics: 205_000 },
  { m: "מרץ", total: 805_000, materials: 400_000, logistics: 198_000 },
  { m: "אפר׳", total: 800_000, materials: 395_000, logistics: 192_000 },
];

const PRODUCT_COSTS = [
  { product: "חלון אלומיניום סטנדרט", unitCost: 285, target: 270, gap: 5.6 },
  { product: "דלת זכוכית מחוסמת", unitCost: 520, target: 500, gap: 4.0 },
  { product: "מעקה פלדה", unitCost: 180, target: 175, gap: 2.9 },
  { product: "חזית מבנה מותאמת", unitCost: 1_200, target: 1_100, gap: 9.1 },
  { product: "תריס אלומיניום חשמלי", unitCost: 420, target: 400, gap: 5.0 },
];

const SAVINGS = [
  { title: "איחוד הזמנות אלומיניום (3 ספקים)", potential: 85_000, effort: "בינוני", priority: "גבוה" },
  { title: "מעבר למכס מופחת (הסכם סחר חופשי)", potential: 62_000, effort: "גבוה", priority: "גבוה" },
  { title: "אופטימיזציית מסלולי הובלה", potential: 45_000, effort: "נמוך", priority: "בינוני" },
  { title: "הפחתת מלאי עודף — קטגוריה C", potential: 38_000, effort: "נמוך", priority: "בינוני" },
];

// ── Inventory tab data ──
const ABC_ANALYSIS = [
  { cls: "A", items: 142, pctItems: 20, value: 3_896_000, pctValue: 80, color: "bg-red-500", turnover: 8.2 },
  { cls: "B", items: 213, pctItems: 30, value: 731_250, pctValue: 15, color: "bg-amber-500", turnover: 5.1 },
  { cls: "C", items: 355, pctItems: 50, value: 243_750, pctValue: 5, color: "bg-green-500", turnover: 2.3 },
];

const TURNOVER_RATES = [
  { category: "אלומיניום גולמי", rate: 9.4, target: 10, status: "good" },
  { category: "זכוכית מחוסמת", rate: 7.8, target: 8, status: "warning" },
  { category: "פלדת נירוסטה", rate: 6.2, target: 7, status: "danger" },
  { category: "חומרי איטום", rate: 11.5, target: 10, status: "good" },
  { category: "ברגים ומחברים", rate: 4.8, target: 6, status: "danger" },
];

const DEAD_STOCK = { totalValue: 187_000, items: 48, oldestDays: 380, topItems: [
  { name: "פרופיל AL-2040 (דגם ישן)", value: 42_000, days: 380 },
  { name: "זגוגית 8 מ\"מ ירוקה", value: 28_500, days: 290 },
  { name: "ציר פלדה T-55 (הופסק)", value: 19_800, days: 250 },
]};

const EXCESS_INVENTORY = { totalValue: 312_000, items: 73, topItems: [
  { name: "פרופיל AL-6060 T5", excess: 2400, unit: "מ\"ט", value: 96_000 },
  { name: "זגוגית שקופה 6 מ\"מ", excess: 180, unit: "מ\"ר", value: 54_000 },
  { name: "סיליקון שקוף 310 מ\"ל", excess: 800, unit: "יח׳", value: 32_000 },
]};

// ── Predictive tab data ──
const FORECAST_ACCURACY = [
  { m: "נוב׳", accuracy: 87.2 }, { m: "דצמ׳", accuracy: 89.5 },
  { m: "ינו׳", accuracy: 91.0 }, { m: "פבר׳", accuracy: 90.3 },
  { m: "מרץ", accuracy: 92.8 }, { m: "אפר׳", accuracy: 93.5 },
];

const STOCKOUT_RISKS = [
  { item: "פרופיל AL-6063 T6", daysLeft: 5, demand: 320, onHand: 85, severity: "critical" },
  { item: "זגוגית מחוסמת 10 מ\"מ", daysLeft: 9, demand: 150, onHand: 65, severity: "high" },
  { item: "בורג נירוסטה M8x30", daysLeft: 14, demand: 5000, onHand: 2800, severity: "medium" },
  { item: "סיליקון מבני שחור", daysLeft: 22, demand: 400, onHand: 310, severity: "low" },
];

const PRICE_TRENDS = [
  { material: "אלומיניום", current: 9.85, predicted: 10.20, change: 3.6, direction: "up" },
  { material: "זכוכית שטוחה", current: 52.0, predicted: 50.5, change: -2.9, direction: "down" },
  { material: "פלדת נירוסטה", current: 14.2, predicted: 15.1, change: 6.3, direction: "up" },
];

const AI_ACTIONS = [
  { action: "להגדיל הזמנת פרופיל AL-6063 ב-40% לפני מחסור צפוי", impact: "גבוה", type: "מלאי" },
  { action: "לנעול מחיר אלומיניום לרבעון הבא — מגמת עלייה צפויה", impact: "גבוה", type: "מחיר" },
  { action: "לנצל ירידת מחיר זכוכית — להגדיל רכש ב-15%", impact: "בינוני", type: "מחיר" },
  { action: "לסלק מלאי מת בקטגוריה C — פוטנציאל שחרור ₪187K", impact: "בינוני", type: "מלאי" },
  { action: "לאחד ספקי פלדה — חיסכון שנתי ₪62K", impact: "בינוני", type: "ספקים" },
  { action: "להחליף ספק ברגים — ציון ביצועים נמוך מתמשך", impact: "נמוך", type: "ספקים" },
];

// ── Helpers ──
const barWidth = (val: number, max: number) => `${Math.max((val / max) * 100, 4)}%`;

const severityBadge = (s: string) => {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700",
    medium: "bg-amber-100 text-amber-700", low: "bg-green-100 text-green-700",
  };
  const label: Record<string, string> = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" };
  return <Badge className={map[s] || ""}>{label[s] || s}</Badge>;
};

// ════════════════════════════════════════════════════════════════
export default function SupplyChainAnalyticsPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("performance");

  const filteredSuppliers = SUPPLIERS.filter(
    (s) => s.name.includes(search) || s.category.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-600" />
            אנליטיקת שרשרת אספקה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            טכנו-כל עוזי — ניתוח ביצועים, עלויות, מלאי וחיזוי
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          עודכן: 08 אפריל 2026
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {KPI_CARDS.map((k) => (
          <Card key={k.title}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground leading-tight">{k.title}</span>
                <div className={`p-1.5 rounded-lg ${k.color}`}>
                  <k.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xl font-bold">{k.value}</p>
              <div className={`flex items-center gap-1 text-xs mt-1 ${k.change < 0 ? "text-green-600" : "text-red-500"}`}>
                {k.change < 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                {Math.abs(k.change)}% מהחודש הקודם
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="performance">ביצועים</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
          <TabsTrigger value="inventory">מלאי</TabsTrigger>
          <TabsTrigger value="predictive">חיזוי</TabsTrigger>
        </TabsList>

        {/* ──── TAB 1: Performance ──── */}
        <TabsContent value="performance" className="space-y-4 mt-4">
          {/* 6-month trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">מגמת ביצועים — 6 חודשים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 font-medium">חודש</th>
                      <th className="text-center py-2 font-medium">OTD %</th>
                      <th className="text-center py-2 font-medium">שיעור מילוי</th>
                      <th className="text-center py-2 font-medium">איכות</th>
                      <th className="text-center py-2 font-medium">יעילות עלות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERF_TREND.map((r) => (
                      <tr key={r.m} className="border-b last:border-0">
                        <td className="py-2 font-medium">{r.m}</td>
                        <td className="text-center"><Badge variant="outline" className="bg-blue-50 text-blue-700">{fmtP(r.otd)}</Badge></td>
                        <td className="text-center"><Badge variant="outline" className="bg-emerald-50 text-emerald-700">{fmtP(r.fill)}</Badge></td>
                        <td className="text-center"><Badge variant="outline" className="bg-purple-50 text-purple-700">{fmtP(r.quality)}</Badge></td>
                        <td className="text-center"><Badge variant="outline" className="bg-amber-50 text-amber-700">{fmtP(r.cost)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Supplier ranking + category scores side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">דירוג ספקים — 10 המובילים</CardTitle>
                  <div className="relative w-48">
                    <Search className="absolute right-2 top-2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="חיפוש ספק..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 text-sm pr-8"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-right py-2 font-medium">#</th>
                        <th className="text-right py-2 font-medium">ספק</th>
                        <th className="text-center py-2 font-medium">ציון</th>
                        <th className="text-center py-2 font-medium">OTD</th>
                        <th className="text-center py-2 font-medium">איכות</th>
                        <th className="text-right py-2 font-medium">קטגוריה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSuppliers.map((s, i) => (
                        <tr key={s.name} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 font-medium">{s.name}</td>
                          <td className="text-center">
                            <span className={`font-bold ${s.score >= 90 ? "text-green-600" : s.score >= 85 ? "text-amber-600" : "text-red-600"}`}>
                              {s.score}
                            </span>
                          </td>
                          <td className="text-center">{fmtP(s.otd)}</td>
                          <td className="text-center">{fmtP(s.quality)}</td>
                          <td><Badge variant="secondary">{s.category}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">ציון לפי קטגוריה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {CATEGORY_SCORES.map((c) => (
                  <div key={c.cat} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{c.cat}</span>
                      <span className="flex items-center gap-1">
                        {c.score}
                        {c.trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
                        {c.trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
                      </span>
                    </div>
                    <Progress value={c.score} className="h-2" />
                    <p className="text-xs text-muted-foreground">{c.suppliers} ספקים</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ──── TAB 2: Costs ──── */}
        <TabsContent value="costs" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Spend by category */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">התפלגות הוצאות לפי קטגוריה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {SPEND_BY_CAT.map((s) => (
                  <div key={s.cat} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{s.cat}</span>
                      <span className="text-muted-foreground">{fmtC(s.amount)} ({fmtP(s.pct)})</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className="bg-blue-500 h-3 rounded-full transition-all"
                        style={{ width: barWidth(s.pct, 55) }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Monthly cost trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">מגמת עלויות חודשית</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 font-medium">חודש</th>
                      <th className="text-center py-2 font-medium">סה״כ</th>
                      <th className="text-center py-2 font-medium">חומרים</th>
                      <th className="text-center py-2 font-medium">לוגיסטיקה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COST_TREND.map((r) => (
                      <tr key={r.m} className="border-b last:border-0">
                        <td className="py-2 font-medium">{r.m}</td>
                        <td className="text-center">{fmtC(r.total)}</td>
                        <td className="text-center text-blue-600">{fmtC(r.materials)}</td>
                        <td className="text-center text-amber-600">{fmtC(r.logistics)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Cost per product + Savings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">עלות ליחידה לפי מוצר</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 font-medium">מוצר</th>
                      <th className="text-center py-2 font-medium">עלות נוכחית</th>
                      <th className="text-center py-2 font-medium">יעד</th>
                      <th className="text-center py-2 font-medium">פער</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRODUCT_COSTS.map((p) => (
                      <tr key={p.product} className="border-b last:border-0">
                        <td className="py-2 font-medium">{p.product}</td>
                        <td className="text-center">{fmtC(p.unitCost)}</td>
                        <td className="text-center text-green-600">{fmtC(p.target)}</td>
                        <td className="text-center">
                          <Badge className={p.gap > 5 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
                            +{fmtP(p.gap)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  הזדמנויות חיסכון
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {SAVINGS.map((s, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium">{s.title}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <Badge className="bg-green-100 text-green-700">{fmtC(s.potential)} פוטנציאל</Badge>
                      <span className="text-muted-foreground">מאמץ: {s.effort}</span>
                      <span className="text-muted-foreground">עדיפות: {s.priority}</span>
                    </div>
                  </div>
                ))}
                <div className="text-sm font-medium text-green-700 bg-green-50 rounded-lg p-3 text-center">
                  סה״כ פוטנציאל חיסכון: {fmtC(SAVINGS.reduce((a, s) => a + s.potential, 0))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ──── TAB 3: Inventory ──── */}
        <TabsContent value="inventory" className="space-y-4 mt-4">
          {/* ABC Analysis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" />
                ניתוח ABC — סיווג מלאי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {ABC_ANALYSIS.map((a) => (
                  <div key={a.cls} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${a.color} flex items-center justify-center text-white font-bold text-lg`}>
                        {a.cls}
                      </div>
                      <div>
                        <p className="font-bold">קטגוריה {a.cls}</p>
                        <p className="text-xs text-muted-foreground">{a.pctItems}% פריטים — {a.pctValue}% ערך</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-muted rounded p-2 text-center">
                        <p className="text-xs text-muted-foreground">פריטים</p>
                        <p className="font-bold">{fmt(a.items)}</p>
                      </div>
                      <div className="bg-muted rounded p-2 text-center">
                        <p className="text-xs text-muted-foreground">ערך</p>
                        <p className="font-bold">{fmtC(a.value)}</p>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">מחזוריות: </span>
                      <span className="font-medium">{a.turnover}x</span>
                    </div>
                    <Progress value={a.pctValue} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Turnover rates */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">שיעורי מחזוריות</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {TURNOVER_RATES.map((t) => (
                  <div key={t.category} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{t.category}</span>
                      <span className={
                        t.status === "good" ? "text-green-600" :
                        t.status === "warning" ? "text-amber-600" : "text-red-600"
                      }>
                        {t.rate}x / {t.target}x
                      </span>
                    </div>
                    <Progress
                      value={Math.min((t.rate / t.target) * 100, 100)}
                      className={`h-2 ${t.status === "danger" ? "[&>div]:bg-red-500" : t.status === "warning" ? "[&>div]:bg-amber-500" : ""}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Dead stock */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  מלאי מת
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-red-50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">ערך כולל</p>
                    <p className="font-bold text-red-700">{fmtC(DEAD_STOCK.totalValue)}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">פריטים</p>
                    <p className="font-bold text-red-700">{DEAD_STOCK.items}</p>
                  </div>
                </div>
                {DEAD_STOCK.topItems.map((d) => (
                  <div key={d.name} className="border rounded p-2 text-sm">
                    <p className="font-medium">{d.name}</p>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{fmtC(d.value)}</span>
                      <span>{d.days} ימים ללא תנועה</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Excess inventory */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Box className="w-4 h-4 text-amber-500" />
                  מלאי עודף
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-amber-50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">ערך כולל</p>
                    <p className="font-bold text-amber-700">{fmtC(EXCESS_INVENTORY.totalValue)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">פריטים</p>
                    <p className="font-bold text-amber-700">{EXCESS_INVENTORY.items}</p>
                  </div>
                </div>
                {EXCESS_INVENTORY.topItems.map((e) => (
                  <div key={e.name} className="border rounded p-2 text-sm">
                    <p className="font-medium">{e.name}</p>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>עודף: {fmt(e.excess)} {e.unit}</span>
                      <span>{fmtC(e.value)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ──── TAB 4: Predictive ──── */}
        <TabsContent value="predictive" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Forecast accuracy */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  דיוק חיזוי ביקוש — מגמה
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {FORECAST_ACCURACY.map((f) => (
                    <div key={f.m} className="flex items-center gap-3">
                      <span className="w-12 text-sm text-muted-foreground">{f.m}</span>
                      <div className="flex-1 bg-muted rounded-full h-4 relative">
                        <div
                          className="bg-purple-500 h-4 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${f.accuracy}%` }}
                        >
                          <span className="text-[10px] text-white font-bold">{fmtP(f.accuracy)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  שיפור של 6.3% בדיוק חיזוי ב-6 חודשים אחרונים
                </p>
              </CardContent>
            </Card>

            {/* Predicted stockouts */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  מחסור צפוי — 30 ימים קרובים
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 font-medium">פריט</th>
                      <th className="text-center py-2 font-medium">ימים</th>
                      <th className="text-center py-2 font-medium">ביקוש</th>
                      <th className="text-center py-2 font-medium">במלאי</th>
                      <th className="text-center py-2 font-medium">חומרה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STOCKOUT_RISKS.map((s) => (
                      <tr key={s.item} className="border-b last:border-0">
                        <td className="py-2 font-medium">{s.item}</td>
                        <td className="text-center font-bold">{s.daysLeft}</td>
                        <td className="text-center">{fmt(s.demand)}</td>
                        <td className="text-center">{fmt(s.onHand)}</td>
                        <td className="text-center">{severityBadge(s.severity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Price predictions + AI actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  תחזית מחירי חומרים מרכזיים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {PRICE_TRENDS.map((p) => (
                  <div key={p.material} className="border rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{p.material}</span>
                      <Badge className={p.direction === "up" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                        {p.direction === "up" ? <ArrowUpRight className="w-3 h-3 ml-1" /> : <ArrowDownRight className="w-3 h-3 ml-1" />}
                        {p.change > 0 ? "+" : ""}{fmtP(p.change)}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground mt-2">
                      <span>נוכחי: ₪{p.current}/ק״ג</span>
                      <span>צפוי: ₪{p.predicted}/ק״ג</span>
                    </div>
                    <Progress
                      value={p.direction === "up" ? 35 + p.change * 5 : 65 - Math.abs(p.change) * 5}
                      className={`h-1.5 mt-2 ${p.direction === "up" ? "[&>div]:bg-red-400" : "[&>div]:bg-green-400"}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-500" />
                  המלצות AI לפעולה
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {AI_ACTIONS.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 border rounded-lg p-3">
                    <div className="mt-0.5 p-1 rounded bg-emerald-50 text-emerald-600">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">{a.action}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">{a.type}</Badge>
                        <Badge className={
                          a.impact === "גבוה" ? "bg-red-100 text-red-700" :
                          a.impact === "בינוני" ? "bg-amber-100 text-amber-700" :
                          "bg-green-100 text-green-700"
                        }>
                          השפעה: {a.impact}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
