import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Brain, TrendingUp, TrendingDown, DollarSign, Users, Clock, AlertTriangle,
  Search, ShoppingCart, BarChart3, Package, Shield, Zap, RefreshCw,
  ArrowUpRight, ArrowDownRight, Target, Truck, FileCheck, PieChart
} from "lucide-react";

const FALLBACK_PRICE_PREDICTIONS = [
  { material: "אלומיניום 6061", current: 12.8, predicted: 11.2, change: -12.5, confidence: 94, recommendation: "לקנות עכשיו", timing: "ירידה צפויה ב-3 שבועות", trend: "down" },
  { material: "זכוכית מחוסמת 10מ\"מ", current: 85, predicted: 92, change: 8.2, confidence: 87, recommendation: "להמתין", timing: "עלייה צפויה ב-2 שבועות", trend: "up" },
  { material: "פלדת אל-חלד 304", current: 24.5, predicted: 23.1, change: -5.7, confidence: 91, recommendation: "לקנות עכשיו", timing: "ירידה מתחילה", trend: "down" },
  { material: "נחושת C110", current: 38.2, predicted: 41.5, change: 8.6, confidence: 82, recommendation: "לקנות עכשיו", timing: "עלייה חדה צפויה", trend: "up" },
];

const FALLBACK_SUPPLIERS = [
  { name: "מתכות השרון בע\"מ", score: 96, risk: "נמוך", delivery: 98, quality: 97, price: 92, category: "מתכות", alternative: "פלדות הצפון" },
  { name: "זכוכית אופטיק", score: 91, risk: "נמוך", delivery: 94, quality: 96, price: 88, category: "זכוכית", alternative: "גלאסטק ישראל" },
  { name: "פלסטיק פרו", score: 87, risk: "בינוני", delivery: 85, quality: 90, price: 91, category: "פלסטיק", alternative: "פולימר טק" },
  { name: "אלקטרו-קום", score: 79, risk: "גבוה", delivery: 72, quality: 85, price: 88, category: "אלקטרוניקה", alternative: "טק-אלקטרו" },
];

const FALLBACK_DEMAND_FORECASTS = [
  { material: "אלומיניום 6061", currentStock: 2400, predictedNeed: 3800, reorderPoint: 1500, seasonality: "גבוה בקיץ", autoOrder: true, daysToReorder: 8 },
  { material: "זכוכית מחוסמת", currentStock: 850, predictedNeed: 1200, reorderPoint: 600, seasonality: "יציב", autoOrder: true, daysToReorder: 14 },
  { material: "נחושת C110", currentStock: 340, predictedNeed: 520, reorderPoint: 200, seasonality: "עולה", autoOrder: true, daysToReorder: 5 },
  { material: "רכיבים אלקטרוניים", currentStock: 12000, predictedNeed: 18500, reorderPoint: 8000, seasonality: "גבוה ברבעון 1", autoOrder: true, daysToReorder: 3 },
];

const FALLBACK_SPEND_CATEGORIES = [
  { category: "חומרי גלם", budget: 2800000, actual: 2650000, compliance: 95, maverick: 3.2 },
  { category: "רכיבים אלקטרוניים", budget: 1500000, actual: 1620000, compliance: 88, maverick: 8.1 },
  { category: "אריזה ולוגיסטיקה", budget: 600000, actual: 680000, compliance: 82, maverick: 12.4 },
  { category: "ציוד משרדי", budget: 200000, actual: 235000, compliance: 78, maverick: 18.6 },
  { category: "שירותים מקצועיים", budget: 450000, actual: 410000, compliance: 93, maverick: 4.8 },
];

const riskColor = (risk: string) => {
  if (risk === "נמוך") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (risk === "בינוני") return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-red-500/20 text-red-300 border-red-500/30";
};

export default function AiProcurementOptimizer() {

  const { data: apiData } = useQuery({
    queryKey: ["ai_procurement_optimizer"],
    queryFn: () => authFetch("/api/ai/ai-procurement-optimizer").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const pricePredictions = apiData?.pricePredictions ?? FALLBACK_PRICE_PREDICTIONS;
  const suppliers = apiData?.suppliers ?? FALLBACK_SUPPLIERS;
  const demandForecasts = apiData?.demandForecasts ?? FALLBACK_DEMAND_FORECASTS;
  const spendCategories = apiData?.spendCategories ?? FALLBACK_SPEND_CATEGORIES;
  const [searchTerm, setSearchTerm] = useState("");

  const kpis = [
    { label: "חיסכון שזוהה", value: "₪1.24M", change: "+18.3%", icon: DollarSign, color: "from-emerald-500 to-teal-600" },
    { label: "המלצות ספקים", value: "47", change: "+12", icon: Users, color: "from-blue-500 to-indigo-600" },
    { label: "תחזיות מחיר", value: "156", change: "94% דיוק", icon: TrendingUp, color: "from-purple-500 to-violet-600" },
    { label: "הזמנות אוטומטיות", value: "23", change: "החודש", icon: ShoppingCart, color: "from-amber-500 to-orange-600" },
    { label: "אופטימיזציית ליד-טיים", value: "-4.2 ימים", change: "שיפור 22%", icon: Clock, color: "from-cyan-500 to-blue-600" },
    { label: "חריגות הוצאה", value: "8", change: "3 קריטיות", icon: AlertTriangle, color: "from-red-500 to-rose-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-purple-400 to-blue-400 bg-clip-text text-transparent">
            אופטימיזציית רכש AI
          </h1>
          <p className="text-muted-foreground mt-1">מנוע בינה מלאכותית לניהול רכש חכם, חיזוי מחירים ובחירת ספקים</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pr-9 w-64 bg-background/50" />
          </div>
          <Button className="bg-gradient-to-l from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
            <Brain className="w-4 h-4 ml-2" />הפעל סריקת AI
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card/60 border-border/40 hover:border-border/70 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${kpi.color} bg-opacity-20`}>
                  <kpi.icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs text-muted-foreground">{kpi.change}</span>
              </div>
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="price" className="space-y-4">
        <TabsList className="bg-card/60 border border-border/40 p-1">
          <TabsTrigger value="price" className="data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-300 gap-2">
            <TrendingUp className="w-4 h-4" />מודיעין מחירים
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300 gap-2">
            <Users className="w-4 h-4" />אופטימיזציית ספקים
          </TabsTrigger>
          <TabsTrigger value="demand" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-300 gap-2">
            <Package className="w-4 h-4" />תחזית ביקוש
          </TabsTrigger>
          <TabsTrigger value="spend" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-300 gap-2">
            <PieChart className="w-4 h-4" />אנליטיקת הוצאות
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Price Intelligence */}
        <TabsContent value="price" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pricePredictions.filter(p => !searchTerm || p.material.includes(searchTerm)).map((item) => (
              <Card key={item.material} className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{item.material}</CardTitle>
                    <Badge className={item.trend === "down" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-red-500/20 text-red-300 border-red-500/30"}>
                      {item.trend === "down" ? <ArrowDownRight className="w-3 h-3 ml-1" /> : <ArrowUpRight className="w-3 h-3 ml-1" />}
                      {item.change > 0 ? "+" : ""}{item.change}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-background/40 rounded-lg p-2">
                      <span className="text-muted-foreground">מחיר נוכחי</span>
                      <div className="font-bold text-foreground">₪{item.current}/ק\"ג</div>
                    </div>
                    <div className="bg-background/40 rounded-lg p-2">
                      <span className="text-muted-foreground">תחזית AI</span>
                      <div className="font-bold text-purple-400">₪{item.predicted}/ק\"ג</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">רמת ביטחון</span>
                    <span className="font-medium text-foreground">{item.confidence}%</span>
                  </div>
                  <Progress value={item.confidence} className="h-1.5" />
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="outline" className="text-xs">{item.timing}</Badge>
                    <Badge className={item.recommendation === "לקנות עכשיו" ? "bg-emerald-500/20 text-emerald-300" : item.recommendation === "להמתין" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}>
                      <Zap className="w-3 h-3 ml-1" />{item.recommendation}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-5 h-5 text-purple-400" />ניתוח מגמות שוק</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: TrendingDown, color: "emerald", label: "מתכות בסיס", desc: "ירידה -8.3% ב-90 יום" },
                  { icon: TrendingUp, color: "red", label: "זכוכית ומינרלים", desc: "עלייה +5.1% ב-60 יום" },
                  { icon: RefreshCw, color: "amber", label: "פולימרים", desc: "תנודתי - המתנה מומלצת" },
                ].map(t => (
                  <div key={t.label} className="bg-background/40 rounded-lg p-4 text-center">
                    <t.icon className={`w-8 h-8 text-${t.color}-400 mx-auto mb-2`} />
                    <div className="text-sm font-semibold text-foreground">{t.label}</div>
                    <div className={`text-xs text-${t.color}-400 mt-1`}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Supplier Optimization */}
        <TabsContent value="suppliers" className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {suppliers.filter(s => !searchTerm || s.name.includes(searchTerm) || s.category.includes(searchTerm)).map((sup) => (
              <Card key={sup.name} className="bg-card/60 border-border/40">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                        <Target className="w-6 h-6 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{sup.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{sup.category}</Badge>
                          <Badge className={riskColor(sup.risk)}>סיכון {sup.risk}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-2xl font-bold text-foreground">{sup.score}</div>
                      <div className="text-xs text-muted-foreground">ציון AI</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {[{ label: "אמינות אספקה", val: sup.delivery }, { label: "איכות", val: sup.quality }, { label: "תחרותיות מחיר", val: sup.price }].map(m => (
                      <div key={m.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{m.label}</span>
                          <span className="text-foreground font-medium">{m.val}%</span>
                        </div>
                        <Progress value={m.val} className="h-1.5" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <Shield className="w-3.5 h-3.5 inline ml-1" />
                      ספק חלופי מומלץ: <span className="text-blue-400 font-medium">{sup.alternative}</span>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs">
                      <FileCheck className="w-3.5 h-3.5 ml-1" />השוואה מלאה
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Demand Forecasting */}
        <TabsContent value="demand" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {demandForecasts.filter(d => !searchTerm || d.material.includes(searchTerm)).map((item) => {
              const stockPct = Math.min(100, Math.round((item.currentStock / item.predictedNeed) * 100));
              const isLow = item.daysToReorder <= 7;
              return (
                <Card key={item.material} className={`bg-card/60 border-border/40 ${isLow ? "border-red-500/40" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold">{item.material}</CardTitle>
                      <div className="flex items-center gap-2">
                        {item.autoOrder && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                            <Zap className="w-3 h-3 ml-1" />הזמנה אוטומטית
                          </Badge>
                        )}
                        {isLow && (
                          <Badge className="bg-red-500/20 text-red-300 border-red-500/30 animate-pulse">
                            <AlertTriangle className="w-3 h-3 ml-1" />דחוף
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-background/40 rounded-lg p-2 text-center">
                        <div className="text-muted-foreground text-xs">מלאי נוכחי</div>
                        <div className="font-bold text-foreground">{item.currentStock.toLocaleString()}</div>
                      </div>
                      <div className="bg-background/40 rounded-lg p-2 text-center">
                        <div className="text-muted-foreground text-xs">צורך חזוי</div>
                        <div className="font-bold text-purple-400">{item.predictedNeed.toLocaleString()}</div>
                      </div>
                      <div className="bg-background/40 rounded-lg p-2 text-center">
                        <div className="text-muted-foreground text-xs">נקודת הזמנה</div>
                        <div className="font-bold text-amber-400">{item.reorderPoint.toLocaleString()}</div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">כיסוי מלאי</span>
                        <span className={`font-medium ${stockPct < 50 ? "text-red-400" : stockPct < 75 ? "text-amber-400" : "text-emerald-400"}`}>{stockPct}%</span>
                      </div>
                      <Progress value={stockPct} className="h-2" />
                    </div>
                    <div className="flex items-center justify-between text-sm pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">עונתיות: <span className="text-foreground">{item.seasonality}</span></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className={`font-medium ${isLow ? "text-red-400" : "text-foreground"}`}>{item.daysToReorder} ימים להזמנה</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 4: Spend Analytics */}
        <TabsContent value="spend" className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {spendCategories.filter(s => !searchTerm || s.category.includes(searchTerm)).map((cat) => {
              const overBudget = cat.actual > cat.budget;
              const usagePct = Math.round((cat.actual / cat.budget) * 100);
              return (
                <Card key={cat.category} className={`bg-card/60 border-border/40 ${overBudget ? "border-red-500/30" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${overBudget ? "bg-red-500/20" : "bg-emerald-500/20"}`}>
                          <DollarSign className={`w-5 h-5 ${overBudget ? "text-red-400" : "text-emerald-400"}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{cat.category}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge className={cat.compliance >= 90 ? "bg-emerald-500/20 text-emerald-300" : cat.compliance >= 80 ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}>
                              עמידה בחוזה {cat.compliance}%
                            </Badge>
                            {cat.maverick > 10 && (
                              <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
                                <AlertTriangle className="w-3 h-3 ml-1" />רכש חריג {cat.maverick}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className={`text-lg font-bold ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
                          ₪{(cat.actual / 1000).toFixed(0)}K
                        </div>
                        <div className="text-xs text-muted-foreground">מתוך ₪{(cat.budget / 1000).toFixed(0)}K</div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">ניצול תקציב</span>
                        <span className={`font-medium ${usagePct > 100 ? "text-red-400" : usagePct > 90 ? "text-amber-400" : "text-emerald-400"}`}>{usagePct}%</span>
                      </div>
                      <Progress value={Math.min(usagePct, 100)} className="h-2" />
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30 text-sm">
                      <span className="text-muted-foreground">
                        {overBudget
                          ? `חריגה של ₪${((cat.actual - cat.budget) / 1000).toFixed(0)}K`
                          : `חיסכון של ₪${((cat.budget - cat.actual) / 1000).toFixed(0)}K`}
                      </span>
                      <Button variant="outline" size="sm" className="text-xs">
                        <BarChart3 className="w-3.5 h-3.5 ml-1" />פירוט מלא
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" />זיהוי רכש חריג (Maverick Spending)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { level: "קריטי", count: 3, color: "red", desc: "רכישות מחוץ לחוזה מעל ₪50K" },
                  { level: "אזהרה", count: 12, color: "amber", desc: "רכישות ללא אישור מקדים" },
                  { level: "מידע", count: 28, color: "blue", desc: "הזמנות מספקים לא מאושרים" },
                ].map(m => (
                  <div key={m.level} className={`bg-${m.color}-500/10 border border-${m.color}-500/20 rounded-lg p-3`}>
                    <div className={`text-sm font-semibold text-${m.color}-400`}>{m.level}</div>
                    <div className="text-2xl font-bold text-foreground mt-1">{m.count}</div>
                    <div className="text-xs text-muted-foreground mt-1">{m.desc}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
