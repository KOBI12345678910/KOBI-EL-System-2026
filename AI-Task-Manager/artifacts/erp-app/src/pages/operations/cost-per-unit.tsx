import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { DollarSign, TrendingUp, TrendingDown, Search, Download, Package, Users, Building2, BarChart3, Target, Lightbulb, ArrowDown, ArrowUp, Layers } from "lucide-react";

const FALLBACK_PRODUCTS = [
  { name: "חלון אלומיניום 100x120", total: 485, material: 210, labor: 145, overhead: 90, energy: 25, packaging: 15, target: 460, trend: "up", category: "חלונות" },
  { name: "חלון אלומיניום 150x180", total: 720, material: 340, labor: 195, overhead: 125, energy: 35, packaging: 25, target: 700, trend: "up", category: "חלונות" },
  { name: "דלת אלומיניום סטנדרט", total: 1250, material: 580, labor: 350, overhead: 210, energy: 60, packaging: 50, target: 1200, trend: "down", category: "דלתות" },
  { name: "דלת הזזה 200x220", total: 1680, material: 780, labor: 470, overhead: 280, energy: 85, packaging: 65, target: 1650, trend: "stable", category: "דלתות" },
  { name: "ויטרינה חנות 300x250", total: 2400, material: 1150, labor: 620, overhead: 400, energy: 130, packaging: 100, target: 2350, trend: "down", category: "ויטרינות" },
  { name: "מעקה אלומיניום (מטר)", total: 320, material: 140, labor: 95, overhead: 55, energy: 18, packaging: 12, target: 310, trend: "up", category: "מעקות" },
  { name: "תריס גלילה חשמלי", total: 890, material: 420, labor: 245, overhead: 150, energy: 40, packaging: 35, target: 850, trend: "up", category: "תריסים" },
  { name: "פרגולת אלומיניום 3x4", total: 3200, material: 1500, labor: 890, overhead: 520, energy: 170, packaging: 120, target: 3100, trend: "down", category: "פרגולות" },
  { name: "חיפוי אלומיניום (מ\"ר)", total: 280, material: 125, labor: 80, overhead: 48, energy: 15, packaging: 12, target: 270, trend: "stable", category: "חיפויים" },
  { name: "זכוכית מחוסמת (מ\"ר)", total: 195, material: 95, labor: 52, overhead: 30, energy: 10, packaging: 8, target: 185, trend: "up", category: "זכוכית" },
];

const FALLBACK_DEPARTMENTS = [
  { name: "חיתוך", totalCost: 245000, units: 4200, costPerUnit: 58.3, labor: 35, material: 10, overhead: 40, energy: 15, efficiency: 92.4, target: 55.0 },
  { name: "הרכבה", totalCost: 380000, units: 2800, costPerUnit: 135.7, labor: 55, material: 5, overhead: 30, energy: 10, efficiency: 87.8, target: 130.0 },
  { name: "ציפוי ואנודייז", totalCost: 185000, units: 3500, costPerUnit: 52.9, labor: 25, material: 30, overhead: 25, energy: 20, efficiency: 85.3, target: 48.0 },
  { name: "זיגוג", totalCost: 210000, units: 2100, costPerUnit: 100.0, labor: 30, material: 35, overhead: 20, energy: 15, efficiency: 90.1, target: 95.0 },
];

const FALLBACK_MONTHLY_TRENDS = [
  { month: "נובמבר 2025", avgCost: 892, material: 412, labor: 258, overhead: 148, energy: 45, packaging: 29, change: null },
  { month: "דצמבר 2025", avgCost: 905, material: 425, labor: 260, overhead: 148, energy: 43, packaging: 29, change: +1.5 },
  { month: "ינואר 2026", avgCost: 918, material: 438, labor: 255, overhead: 152, energy: 44, packaging: 29, change: +1.4 },
  { month: "פברואר 2026", avgCost: 895, material: 410, labor: 262, overhead: 150, energy: 44, packaging: 29, change: -2.5 },
  { month: "מרץ 2026", avgCost: 878, material: 398, labor: 258, overhead: 148, energy: 45, packaging: 29, change: -1.9 },
  { month: "אפריל 2026", avgCost: 870, material: 392, labor: 256, overhead: 148, energy: 45, packaging: 29, change: -0.9 },
];

const FALLBACK_OPTIMIZATIONS = [
  { area: "רכש חומרי גלם", potential: 45000, pctSave: 4.2, effort: "בינוני", timeline: "Q2 2026", description: "מו\"מ עם ספק אלומיניום חלופי מטורקיה - מחיר נמוך ב-8%", status: "בבדיקה", priority: "גבוה" },
  { area: "אוטומציה בקו הרכבה", potential: 62000, pctSave: 5.8, effort: "גבוה", timeline: "Q3 2026", description: "התקנת רובוט נוסף בתחנת הידוק - חיסכון 2 עובדים", status: "מאושר", priority: "גבוה" },
  { area: "הפחתת פסולת חיתוך", potential: 28000, pctSave: 2.6, effort: "נמוך", timeline: "Q2 2026", description: "אופטימיזציית תוכנת קינון (nesting) - הפחתת פסולת מ-12% ל-8%", status: "בביצוע", priority: "בינוני" },
  { area: "חיסכון באנרגיה", potential: 18000, pctSave: 1.7, effort: "נמוך", timeline: "Q2 2026", description: "התקנת מהפכי תדר במדחסים - חיסכון 20% בצריכת חשמל", status: "בבדיקה", priority: "בינוני" },
  { area: "צמצום עיבוד חוזר", potential: 35000, pctSave: 3.3, effort: "בינוני", timeline: "Q2-Q3 2026", description: "שיפור בקרת איכות בתהליך - הפחתת עיבוד חוזר מ-3.2% ל-1.5%", status: "מתוכנן", priority: "גבוה" },
  { area: "אריזה ולוגיסטיקה", potential: 12000, pctSave: 1.1, effort: "נמוך", timeline: "Q2 2026", description: "מעבר לאריזת בועות ממוחזרת - חיסכון 15% בעלות אריזה", status: "מאושר", priority: "נמוך" },
];

const STAT: Record<string, string> = {
  "מאושר": "bg-green-500/20 text-green-400",
  "בביצוע": "bg-blue-500/20 text-blue-400",
  "בבדיקה": "bg-yellow-500/20 text-yellow-400",
  "מתוכנן": "bg-purple-500/20 text-purple-400",
};

export default function CostPerUnit() {
  const { data: costperunitData } = useQuery({
    queryKey: ["cost-per-unit"],
    queryFn: () => authFetch("/api/operations/cost_per_unit"),
    staleTime: 5 * 60 * 1000,
  });

  const products = costperunitData ?? FALLBACK_PRODUCTS;

  const [search, setSearch] = useState("");

  const avgCost = "870 \u20AA";
  const materialCost = "45.1%";
  const laborCost = "29.4%";
  const overheadCost = "17.0%";
  const trendDir = "ירידה של 0.9%";
  const targetVariance = "+2.8%";

  const kpis = [
    { label: "עלות ממוצעת ליחידה", value: avgCost, icon: DollarSign, color: "text-blue-400" },
    { label: "עלות חומרים", value: materialCost, icon: Package, color: "text-amber-400" },
    { label: "עלות עבודה", value: laborCost, icon: Users, color: "text-green-400" },
    { label: "תקורה", value: overheadCost, icon: Building2, color: "text-purple-400" },
    { label: "מגמה חודשית", value: trendDir, icon: TrendingDown, color: "text-emerald-400" },
    { label: "סטייה מיעד", value: targetVariance, icon: Target, color: "text-red-400" },
  ];

  const filteredProducts = products.filter(p =>
    !search || p.name.includes(search) || p.category.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-green-400" />
            עלות ליחידה - ניתוח עלויות ייצור
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי - פירוט עלויות חומרים, עבודה ותקורה לכל מוצר</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא דו"ח</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <kpi.icon className={`w-5 h-5 ${kpi.color} mb-2`} />
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="byProduct" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="byProduct">לפי מוצר</TabsTrigger>
          <TabsTrigger value="byDept">לפי מחלקה</TabsTrigger>
          <TabsTrigger value="trends">מגמות</TabsTrigger>
          <TabsTrigger value="optimize">אופטימיזציה</TabsTrigger>
        </TabsList>

        <TabsContent value="byProduct" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-blue-400" />עלות ליחידה - פירוט לפי מוצר</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש מוצר..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חומרים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עבודה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תקורה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אנרגיה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אריזה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סה"כ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">יעד</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">מגמה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p, i) => {
                      const variance = ((p.total - p.target) / p.target * 100).toFixed(1);
                      const isOver = p.total > p.target;
                      return (
                        <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                          <td className="p-3 font-medium text-foreground">{p.name}</td>
                          <td className="p-3"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                          <td className="p-3 text-foreground">{p.material} &#8362;</td>
                          <td className="p-3 text-foreground">{p.labor} &#8362;</td>
                          <td className="p-3 text-foreground">{p.overhead} &#8362;</td>
                          <td className="p-3 text-muted-foreground">{p.energy} &#8362;</td>
                          <td className="p-3 text-muted-foreground">{p.packaging} &#8362;</td>
                          <td className="p-3 font-bold text-foreground">{p.total} &#8362;</td>
                          <td className="p-3 text-muted-foreground">{p.target} &#8362;</td>
                          <td className="p-3 text-center">
                            <span className={`flex items-center justify-center gap-1 text-xs font-medium ${isOver ? 'text-red-400' : 'text-green-400'}`}>
                              {isOver ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                              {isOver ? '+' : ''}{variance}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="byDept" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-purple-400" />עלויות לפי מחלקה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {departments.map((d, i) => (
                  <div key={i} className="p-5 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-foreground">{d.name}</h3>
                      <Badge className={d.costPerUnit <= d.target ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                        {d.costPerUnit <= d.target ? "בתקציב" : "חריגה"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">עלות כוללת</div>
                        <div className="text-lg font-bold text-foreground">{(d.totalCost / 1000).toFixed(0)}K &#8362;</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">יחידות</div>
                        <div className="text-lg font-bold text-foreground">{d.units.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">עלות ליחידה</div>
                        <div className="text-lg font-bold text-blue-400">{d.costPerUnit} &#8362;</div>
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">עבודה ({d.labor}%)</span>
                        <Progress value={d.labor} className="h-2 w-32" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">חומרים ({d.material}%)</span>
                        <Progress value={d.material} className="h-2 w-32" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">תקורה ({d.overhead}%)</span>
                        <Progress value={d.overhead} className="h-2 w-32" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">אנרגיה ({d.energy}%)</span>
                        <Progress value={d.energy} className="h-2 w-32" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">יעילות מחלקה: <span className="text-foreground font-medium">{d.efficiency}%</span></span>
                      <span className="text-muted-foreground">יעד: <span className="text-foreground">{d.target} &#8362;/יח'</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-400" />מגמות עלויות - 6 חודשים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">חודש</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חומרים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עבודה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תקורה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אנרגיה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אריזה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סה"כ ממוצע</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">שינוי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTrends.map((t, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{t.month}</td>
                        <td className="p-3 text-amber-400">{t.material} &#8362;</td>
                        <td className="p-3 text-green-400">{t.labor} &#8362;</td>
                        <td className="p-3 text-purple-400">{t.overhead} &#8362;</td>
                        <td className="p-3 text-muted-foreground">{t.energy} &#8362;</td>
                        <td className="p-3 text-muted-foreground">{t.packaging} &#8362;</td>
                        <td className="p-3 font-bold text-foreground">{t.avgCost} &#8362;</td>
                        <td className="p-3 text-center">
                          {t.change === null ? (
                            <span className="text-muted-foreground">---</span>
                          ) : (
                            <span className={`flex items-center justify-center gap-1 text-xs font-medium ${t.change < 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {t.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {t.change > 0 ? '+' : ''}{t.change}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                  <TrendingDown className="w-4 h-4" />
                  מגמה חיובית: ירידה מצטברת של 2.4% בעלות ממוצעת ליחידה ב-3 חודשים אחרונים
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimize" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-yellow-400" />הזדמנויות לחיסכון בעלויות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="text-sm text-blue-400">
                  <Layers className="w-4 h-4 inline ml-1" />
                  פוטנציאל חיסכון כולל: <span className="font-bold">{optimizations.reduce((s, o) => s + o.potential, 0).toLocaleString()} &#8362;</span> בשנה ({optimizations.reduce((s, o) => s + o.pctSave, 0).toFixed(1)}% מעלות הייצור)
                </div>
              </div>
              <div className="space-y-3">
                {optimizations.map((o, i) => (
                  <div key={i} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-foreground">{o.area}</span>
                        <Badge className={STAT[o.status]}>{o.status}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">מאמץ: {o.effort}</Badge>
                        <span className="text-green-400 font-bold">{o.potential.toLocaleString()} &#8362;/שנה</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{o.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>חיסכון: <span className="text-green-400">{o.pctSave}%</span></span>
                      <span>לו"ז: {o.timeline}</span>
                      <span>עדיפות: <span className={o.priority === "גבוה" ? "text-red-400" : o.priority === "בינוני" ? "text-yellow-400" : "text-blue-400"}>{o.priority}</span></span>
                    </div>
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
