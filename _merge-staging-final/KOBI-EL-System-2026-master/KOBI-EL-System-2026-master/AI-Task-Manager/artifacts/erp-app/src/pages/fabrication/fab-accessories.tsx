import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Package, Tag, DollarSign, AlertTriangle, Truck, TrendingUp,
  Search, Download, Plus, ArrowUpDown, RefreshCw, ShoppingCart,
  BarChart3, Layers, ClipboardList
} from "lucide-react";

interface Accessory {
  id: number; name: string; sku: string; category: string; unit: string;
  stock: number; minLevel: number; price: number; supplier: string;
  monthlyUsage: number; lastOrder: string;
}

const FALLBACK_CATALOG: Accessory[] = [
  { id: 1, name: "ידיות אלומיניום", sku: "HND-AL-001", category: "ידיות", unit: "יח׳", stock: 342, minLevel: 100, price: 28.5, supplier: "רותם פרזול", monthlyUsage: 185, lastOrder: "2026-03-22" },
  { id: 2, name: "צירים כבדים 120 ק״ג", sku: "HNG-HV-012", category: "צירים", unit: "זוג", stock: 156, minLevel: 50, price: 45.0, supplier: "GU ישראל", monthlyUsage: 72, lastOrder: "2026-03-18" },
  { id: 3, name: "מנעול רב-נקודתי", sku: "LCK-MP-005", category: "מנעולים", unit: "יח׳", stock: 89, minLevel: 30, price: 185.0, supplier: "MACO", monthlyUsage: 34, lastOrder: "2026-04-01" },
  { id: 4, name: "מנעול צילינדר", sku: "LCK-CY-003", category: "מנעולים", unit: "יח׳", stock: 210, minLevel: 80, price: 62.0, supplier: "מולטילוק", monthlyUsage: 95, lastOrder: "2026-03-28" },
  { id: 5, name: "גלגלות הזזה", sku: "RLR-SL-008", category: "גלגלות", unit: "סט", stock: 67, minLevel: 40, price: 52.0, supplier: "Siegenia", monthlyUsage: 38, lastOrder: "2026-03-15" },
  { id: 6, name: "גומיית EPDM 3.5 מ״מ", sku: "WS-EP-021", category: "גומיות איטום", unit: "מטר", stock: 2800, minLevel: 1000, price: 2.8, supplier: "דברת גומי", monthlyUsage: 1450, lastOrder: "2026-04-03" },
  { id: 7, name: "אטם סיליקון שקוף", sku: "GSK-SI-004", category: "אטמים", unit: "שפופרת", stock: 124, minLevel: 50, price: 18.5, supplier: "סיקה ישראל", monthlyUsage: 62, lastOrder: "2026-03-20" },
  { id: 8, name: "ברגי נירוסטה 4.2x32", sku: "SCR-SS-016", category: "ברגים", unit: "חבילה/100", stock: 45, minLevel: 30, price: 32.0, supplier: "בורג בע״מ", monthlyUsage: 28, lastOrder: "2026-03-10" },
  { id: 9, name: "עוגני פלדה 10x80", sku: "ANC-ST-009", category: "עוגנים", unit: "חבילה/50", stock: 38, minLevel: 20, price: 48.0, supplier: "פישר ישראל", monthlyUsage: 15, lastOrder: "2026-03-25" },
  { id: 10, name: "זוויתנים פנימיים", sku: "CLT-IN-007", category: "זוויתנים", unit: "יח׳", stock: 520, minLevel: 200, price: 4.2, supplier: "אלוביט", monthlyUsage: 310, lastOrder: "2026-04-02" },
  { id: 11, name: "רצועת שבירה תרמית", sku: "TBK-PA-014", category: "שבירה תרמית", unit: "מטר", stock: 1200, minLevel: 500, price: 8.5, supplier: "Ensinger", monthlyUsage: 620, lastOrder: "2026-03-30" },
  { id: 12, name: "פקקי ניקוז 15 מ״מ", sku: "DRC-PL-010", category: "פקקי ניקוז", unit: "יח׳", stock: 860, minLevel: 300, price: 1.2, supplier: "פלסטיקה א.ש", monthlyUsage: 420, lastOrder: "2026-03-12" },
  { id: 13, name: "כיסויי בורג דקורטיבי", sku: "CAP-DC-018", category: "כיסויים", unit: "יח׳", stock: 1100, minLevel: 400, price: 0.8, supplier: "פלסטיקה א.ש", monthlyUsage: 390, lastOrder: "2026-03-29" },
  { id: 14, name: "פרופיל אדן חיצוני", sku: "SIL-EX-022", category: "אדנים", unit: "מטר", stock: 180, minLevel: 100, price: 35.0, supplier: "אלוביט", monthlyUsage: 88, lastOrder: "2026-04-05" },
  { id: 15, name: "אטם סף תחתון", sku: "THS-RB-006", category: "אטמי סף", unit: "מטר", stock: 340, minLevel: 150, price: 12.0, supplier: "דברת גומי", monthlyUsage: 110, lastOrder: "2026-03-27" },
];

const FALLBACK_MONTHLY_TRENDS = [
  { month: "ינואר", total: 3420 }, { month: "פברואר", total: 3680 },
  { month: "מרץ", total: 4150 }, { month: "אפריל", total: 3920 },
];

const CAT_COLORS: Record<string, string> = {
  "ידיות": "bg-blue-500/20 text-blue-300", "צירים": "bg-purple-500/20 text-purple-300",
  "מנעולים": "bg-red-500/20 text-red-300", "גלגלות": "bg-amber-500/20 text-amber-300",
  "גומיות איטום": "bg-green-500/20 text-green-300", "אטמים": "bg-teal-500/20 text-teal-300",
  "ברגים": "bg-slate-500/20 text-slate-300", "עוגנים": "bg-orange-500/20 text-orange-300",
  "זוויתנים": "bg-cyan-500/20 text-cyan-300", "שבירה תרמית": "bg-pink-500/20 text-pink-300",
  "פקקי ניקוז": "bg-lime-500/20 text-lime-300", "כיסויים": "bg-indigo-500/20 text-indigo-300",
  "אדנים": "bg-yellow-500/20 text-yellow-300", "אטמי סף": "bg-emerald-500/20 text-emerald-300",
};

export default function FabAccessories() {
  const { data: apiCATALOG } = useQuery({
    queryKey: ["/api/fabrication/fab-accessories/catalog"],
    queryFn: () => authFetch("/api/fabrication/fab-accessories/catalog").then(r => r.json()).catch(() => null),
  });
  const CATALOG = Array.isArray(apiCATALOG) ? apiCATALOG : (apiCATALOG?.data ?? apiCATALOG?.items ?? FALLBACK_CATALOG);


  const { data: apiMONTHLY_TRENDS } = useQuery({
    queryKey: ["/api/fabrication/fab-accessories/monthly-trends"],
    queryFn: () => authFetch("/api/fabrication/fab-accessories/monthly-trends").then(r => r.json()).catch(() => null),
  });
  const MONTHLY_TRENDS = Array.isArray(apiMONTHLY_TRENDS) ? apiMONTHLY_TRENDS : (apiMONTHLY_TRENDS?.data ?? apiMONTHLY_TRENDS?.items ?? FALLBACK_MONTHLY_TRENDS);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("catalog");

  const totalItems = CATALOG.length;
  const activeSkus = CATALOG.filter(i => i.stock > 0).length;
  const stockValue = CATALOG.reduce((s, i) => s + i.stock * i.price, 0);
  const lowStockAlerts = CATALOG.filter(i => i.stock <= i.minLevel).length;
  const suppliers = [...new Set(CATALOG.map(i => i.supplier))].length;
  const monthlyConsumption = CATALOG.reduce((s, i) => s + i.monthlyUsage, 0);

  const filteredCatalog = useMemo(() =>
    CATALOG.filter(i =>
      !search || i.name.includes(search) || i.sku.toLowerCase().includes(search.toLowerCase()) || i.supplier.includes(search)
    ), [search]);

  const categories = useMemo(() => {
    const map: Record<string, { count: number; totalStock: number; totalValue: number }> = {};
    CATALOG.forEach(i => {
      if (!map[i.category]) map[i.category] = { count: 0, totalStock: 0, totalValue: 0 };
      map[i.category].count++;
      map[i.category].totalStock += i.stock;
      map[i.category].totalValue += i.stock * i.price;
    });
    return Object.entries(map).sort((a, b) => b[1].totalValue - a[1].totalValue);
  }, []);

  const reorderItems = useMemo(() =>
    CATALOG.filter(i => i.stock <= i.minLevel * 1.2)
      .sort((a, b) => (a.stock / a.minLevel) - (b.stock / b.minLevel)),
  []);

  const kpis = [
    { label: "סה״כ פריטים", value: totalItems, icon: Package, color: "text-blue-400" },
    { label: "מק״טים פעילים", value: activeSkus, icon: Tag, color: "text-green-400" },
    { label: "שווי מלאי", value: `${(stockValue / 1000).toFixed(0)}K ₪`, icon: DollarSign, color: "text-emerald-400" },
    { label: "התראות מלאי נמוך", value: lowStockAlerts, icon: AlertTriangle, color: "text-red-400" },
    { label: "ספקים", value: suppliers, icon: Truck, color: "text-purple-400" },
    { label: "צריכה חודשית", value: monthlyConsumption.toLocaleString(), icon: TrendingUp, color: "text-amber-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול אביזרים וחומרה</h1>
          <p className="text-sm text-muted-foreground mt-1">קטלוג, מעקב צריכה והזמנות חוזרות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm"><Plus className="w-4 h-4 ml-1" />הוספת פריט</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <k.icon className={`w-5 h-5 ${k.color}`} />
                {k.label === "התראות מלאי נמוך" && lowStockAlerts > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">דחוף</Badge>
                )}
              </div>
              <div className="text-2xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="catalog" className="gap-1.5"><ClipboardList className="w-4 h-4" />קטלוג</TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5"><Layers className="w-4 h-4" />קטגוריות</TabsTrigger>
          <TabsTrigger value="consumption" className="gap-1.5"><BarChart3 className="w-4 h-4" />מעקב צריכה</TabsTrigger>
          <TabsTrigger value="reorder" className="gap-1.5"><ShoppingCart className="w-4 h-4" />הזמנות חוזרות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Catalog */}
        <TabsContent value="catalog">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">קטלוג אביזרים</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש לפי שם, מק״ט, ספק..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      {["שם פריט", "מק״ט", "קטגוריה", "יחידה", "מלאי", "מינימום", "מחיר ₪", "ספק"].map(h => (
                        <th key={h} className="text-right p-3 text-muted-foreground font-medium">
                          <span className="flex items-center gap-1">{h}<ArrowUpDown className="w-3 h-3 opacity-40" /></span>
                        </th>
                      ))}
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalog.map(item => {
                      const ratio = item.stock / item.minLevel;
                      const status = ratio <= 1 ? "חסר" : ratio <= 1.5 ? "נמוך" : "תקין";
                      const sc = status === "חסר" ? "bg-red-500/20 text-red-300" : status === "נמוך" ? "bg-yellow-500/20 text-yellow-300" : "bg-green-500/20 text-green-300";
                      return (
                        <tr key={item.id} className="border-b border-border/30 hover:bg-card/80 transition-colors">
                          <td className="p-3 text-foreground font-medium">{item.name}</td>
                          <td className="p-3 text-muted-foreground font-mono text-xs">{item.sku}</td>
                          <td className="p-3"><Badge className={CAT_COLORS[item.category] || "bg-gray-500/20 text-gray-300"}>{item.category}</Badge></td>
                          <td className="p-3 text-muted-foreground">{item.unit}</td>
                          <td className="p-3 text-foreground font-semibold">{item.stock.toLocaleString()}</td>
                          <td className="p-3 text-muted-foreground">{item.minLevel.toLocaleString()}</td>
                          <td className="p-3 text-foreground">{item.price.toFixed(2)}</td>
                          <td className="p-3 text-muted-foreground">{item.supplier}</td>
                          <td className="p-3 text-center"><Badge className={sc}>{status}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-muted-foreground mt-3 text-left">{filteredCatalog.length} פריטים מוצגים</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Categories */}
        <TabsContent value="categories">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map(([cat, data]) => (
              <Card key={cat} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={CAT_COLORS[cat] || "bg-gray-500/20 text-gray-300"} >{cat}</Badge>
                    <span className="text-xs text-muted-foreground">{data.count} פריטים</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">מלאי כולל</span>
                      <span className="text-foreground font-semibold">{data.totalStock.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">שווי מלאי</span>
                      <span className="text-foreground font-semibold">₪{data.totalValue.toLocaleString()}</span>
                    </div>
                    <Progress value={Math.min(100, (data.totalValue / stockValue) * 100)} className="h-2" />
                    <div className="text-[11px] text-muted-foreground text-left">
                      {((data.totalValue / stockValue) * 100).toFixed(1)}% מסה״כ השווי
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Consumption Tracking */}
        <TabsContent value="consumption">
          <div className="space-y-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">מגמות צריכה חודשיות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3 h-40">
                  {MONTHLY_TRENDS.map(m => {
                    const pct = (m.total / 4500) * 100;
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-foreground font-semibold">{m.total.toLocaleString()}</span>
                        <div className="w-full bg-primary/20 rounded-t-md relative" style={{ height: `${pct}%` }}>
                          <div className="absolute inset-0 bg-primary/60 rounded-t-md" />
                        </div>
                        <span className="text-xs text-muted-foreground">{m.month}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">צריכה לפי פריט - חודש נוכחי</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...CATALOG].sort((a, b) => b.monthlyUsage - a.monthlyUsage).map(item => {
                    const maxUsage = Math.max(...CATALOG.map(i => i.monthlyUsage));
                    const pct = (item.monthlyUsage / maxUsage) * 100;
                    const weeksLeft = item.monthlyUsage > 0 ? ((item.stock / item.monthlyUsage) * 4.3).toFixed(1) : "---";
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        <div className="w-40 text-sm text-foreground truncate">{item.name}</div>
                        <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden relative">
                          <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          <span className="absolute inset-0 flex items-center justify-center text-xs text-foreground font-medium">
                            {item.monthlyUsage.toLocaleString()} {item.unit}
                          </span>
                        </div>
                        <div className="w-24 text-left text-xs text-muted-foreground">{weeksLeft} שבועות</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Reorder Management */}
        <TabsContent value="reorder">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  ניהול הזמנות חוזרות
                  <Badge variant="outline" className="mr-2">{reorderItems.length} פריטים</Badge>
                </CardTitle>
                <Button size="sm" variant="outline"><RefreshCw className="w-4 h-4 ml-1" />חישוב מחדש</Button>
              </div>
            </CardHeader>
            <CardContent>
              {reorderItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">כל הפריטים מעל רמת המינימום</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reorderItems.map(item => {
                    const ratio = item.stock / item.minLevel;
                    const isCritical = ratio <= 1;
                    const suggestedQty = Math.ceil((item.minLevel * 2 - item.stock) / 10) * 10;
                    const estimatedCost = suggestedQty * item.price;
                    return (
                      <div key={item.id} className={`p-4 rounded-lg border ${isCritical ? "border-red-500/40 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <Badge className={isCritical ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"}>
                              {isCritical ? "קריטי" : "נמוך"}
                            </Badge>
                            <span className="font-medium text-foreground">{item.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{item.sku}</span>
                          </div>
                          <Button size="sm" className={isCritical ? "bg-red-600 hover:bg-red-700" : ""}>
                            <ShoppingCart className="w-4 h-4 ml-1" />הזמן עכשיו
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground text-xs">מלאי נוכחי</div>
                            <div className="text-foreground font-semibold">{item.stock.toLocaleString()} {item.unit}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">רמת מינימום</div>
                            <div className="text-foreground">{item.minLevel.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">כמות מומלצת</div>
                            <div className="text-foreground font-semibold">{suggestedQty.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">עלות משוערת</div>
                            <div className="text-foreground">₪{estimatedCost.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">ספק</div>
                            <div className="text-foreground">{item.supplier}</div>
                          </div>
                        </div>
                        <Progress value={(ratio) * 100} className="h-1.5 mt-3" />
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-2">
                    <span className="text-sm text-muted-foreground">סה״כ עלות הזמנה משוערת:</span>
                    <span className="text-lg font-bold text-foreground">
                      ₪{reorderItems.reduce((s, i) => {
                        const qty = Math.ceil((i.minLevel * 2 - i.stock) / 10) * 10;
                        return s + qty * i.price;
                      }, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
