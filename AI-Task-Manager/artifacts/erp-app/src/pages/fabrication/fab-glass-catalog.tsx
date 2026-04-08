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
  Search, Package, Layers, DollarSign, Truck, AlertTriangle, Clock,
  ThermometerSun, Eye, Ruler, Weight, Download, Plus,
  Star, ArrowUpDown
} from "lucide-react";

/* ── Glass Catalog Data ─────────────────────────────────────────────── */
const FALLBACK_GLASSCATALOG = [
  { id: 1, name: "פלואט שקוף 4 מ\"מ", type: "פלואט", thickness: 4, weight: 10, uValue: 5.8, stockM2: 1240, priceM2: 38, status: "תקין", color: "שקוף" },
  { id: 2, name: "פלואט שקוף 5 מ\"מ", type: "פלואט", thickness: 5, weight: 12.5, uValue: 5.7, stockM2: 980, priceM2: 45, status: "תקין", color: "שקוף" },
  { id: 3, name: "פלואט שקוף 6 מ\"מ", type: "פלואט", thickness: 6, weight: 15, uValue: 5.6, stockM2: 1560, priceM2: 52, status: "תקין", color: "שקוף" },
  { id: 4, name: "פלואט שקוף 8 מ\"מ", type: "פלואט", thickness: 8, weight: 20, uValue: 5.5, stockM2: 620, priceM2: 68, status: "נמוך", color: "שקוף" },
  { id: 5, name: "פלואט שקוף 10 מ\"מ", type: "פלואט", thickness: 10, weight: 25, uValue: 5.4, stockM2: 340, priceM2: 85, status: "נמוך", color: "שקוף" },
  { id: 6, name: "מחוסם 6 מ\"מ", type: "מחוסם", thickness: 6, weight: 15, uValue: 5.6, stockM2: 2100, priceM2: 95, status: "תקין", color: "שקוף" },
  { id: 7, name: "מחוסם 8 מ\"מ", type: "מחוסם", thickness: 8, weight: 20, uValue: 5.5, stockM2: 1450, priceM2: 120, status: "תקין", color: "שקוף" },
  { id: 8, name: "מחוסם 10 מ\"מ", type: "מחוסם", thickness: 10, weight: 25, uValue: 5.4, stockM2: 780, priceM2: 145, status: "תקין", color: "שקוף" },
  { id: 9, name: "למינציה 6.38 מ\"מ", type: "למינציה", thickness: 6.38, weight: 15.2, uValue: 5.5, stockM2: 890, priceM2: 135, status: "תקין", color: "שקוף" },
  { id: 10, name: "למינציה 8.38 מ\"מ", type: "למינציה", thickness: 8.38, weight: 20.2, uValue: 5.4, stockM2: 420, priceM2: 165, status: "נמוך", color: "שקוף" },
  { id: 11, name: "Low-E 6 מ\"מ", type: "Low-E", thickness: 6, weight: 15, uValue: 3.3, stockM2: 1680, priceM2: 110, status: "תקין", color: "שקוף" },
  { id: 12, name: "צבועה ברונזה 6 מ\"מ", type: "צבועה", thickness: 6, weight: 15, uValue: 5.5, stockM2: 560, priceM2: 72, status: "תקין", color: "ברונזה" },
  { id: 13, name: "צבועה אפור 6 מ\"מ", type: "צבועה", thickness: 6, weight: 15, uValue: 5.5, stockM2: 480, priceM2: 72, status: "נמוך", color: "אפור" },
  { id: 14, name: "צבועה ירוק 6 מ\"מ", type: "צבועה", thickness: 6, weight: 15, uValue: 5.5, stockM2: 310, priceM2: 72, status: "נמוך", color: "ירוק" },
  { id: 15, name: "חלבית (פרוסטד) 6 מ\"מ", type: "חלבית", thickness: 6, weight: 15, uValue: 5.6, stockM2: 650, priceM2: 88, status: "תקין", color: "חלבי" },
  { id: 16, name: "דוגמתית (פטרן) 4 מ\"מ", type: "דוגמתית", thickness: 4, weight: 10, uValue: 5.7, stockM2: 280, priceM2: 65, status: "נמוך", color: "שקוף" },
];

const FALLBACK_IGUCONFIGS = [
  { id: 1, name: "4-12-4", outer: 4, spacer: 12, inner: 4, totalMm: 20, spacerType: "אלומיניום", gasFill: "אוויר", uValue: 2.8, weight: 20, priceM2: 145, popularity: 92 },
  { id: 2, name: "4-16-4", outer: 4, spacer: 16, inner: 4, totalMm: 24, spacerType: "אלומיניום", gasFill: "אוויר", uValue: 2.7, weight: 20, priceM2: 155, popularity: 85 },
  { id: 3, name: "6-12-6", outer: 6, spacer: 12, inner: 6, totalMm: 24, spacerType: "אלומיניום", gasFill: "אוויר", uValue: 2.7, weight: 30, priceM2: 185, popularity: 78 },
  { id: 4, name: "6-16-6", outer: 6, spacer: 16, inner: 6, totalMm: 28, spacerType: "Warm Edge", gasFill: "ארגון", uValue: 1.4, weight: 30, priceM2: 245, popularity: 88 },
  { id: 5, name: "6-12-6 Low-E", outer: 6, spacer: 12, inner: 6, totalMm: 24, spacerType: "Warm Edge", gasFill: "ארגון", uValue: 1.1, weight: 30, priceM2: 295, popularity: 95 },
  { id: 6, name: "8-16-8", outer: 8, spacer: 16, inner: 8, totalMm: 32, spacerType: "Warm Edge", gasFill: "ארגון", uValue: 1.3, weight: 40, priceM2: 320, popularity: 62 },
  { id: 7, name: "4-12-4-12-4 (טריפל)", outer: 4, spacer: 12, inner: 4, totalMm: 36, spacerType: "Warm Edge", gasFill: "ארגון", uValue: 0.7, weight: 30, priceM2: 385, popularity: 45 },
  { id: 8, name: "6-16-6 מחוסם", outer: 6, spacer: 16, inner: 6, totalMm: 28, spacerType: "Warm Edge", gasFill: "ארגון", uValue: 1.3, weight: 30, priceM2: 340, popularity: 72 },
];

const FALLBACK_STOCKITEMS = [
  { type: "פלואט 4 מ\"מ", inStock: 1240, minLevel: 500, incoming: 800, monthlyUse: 420, eta: "12/04" },
  { type: "פלואט 6 מ\"מ", inStock: 1560, minLevel: 600, incoming: 0, monthlyUse: 520, eta: "-" },
  { type: "מחוסם 6 מ\"מ", inStock: 2100, minLevel: 800, incoming: 500, monthlyUse: 680, eta: "18/04" },
  { type: "מחוסם 8 מ\"מ", inStock: 1450, minLevel: 500, incoming: 0, monthlyUse: 380, eta: "-" },
  { type: "למינציה 6.38 מ\"מ", inStock: 890, minLevel: 400, incoming: 0, monthlyUse: 310, eta: "-" },
  { type: "למינציה 8.38 מ\"מ", inStock: 420, minLevel: 300, incoming: 500, monthlyUse: 190, eta: "15/04" },
  { type: "Low-E 6 מ\"מ", inStock: 1680, minLevel: 600, incoming: 0, monthlyUse: 540, eta: "-" },
  { type: "צבועה ברונזה", inStock: 560, minLevel: 300, incoming: 200, monthlyUse: 180, eta: "20/04" },
  { type: "חלבית", inStock: 650, minLevel: 250, incoming: 0, monthlyUse: 160, eta: "-" },
];

const FALLBACK_SUPPLIERS = [
  { id: 1, name: "זכוכית ישראל בע\"מ", region: "חיפה", types: "פלואט, מחוסם", leadDays: 5, priceIndex: 98, quality: 4.8, onTime: 96, orders: 24, volume: 8400 },
  { id: 2, name: "Guardian Industries", region: "יבוא - ארה\"ב", types: "Low-E, מחוסם", leadDays: 21, priceIndex: 105, quality: 4.9, onTime: 92, orders: 12, volume: 5200 },
  { id: 3, name: "AGC Glass Europe", region: "יבוא - בלגיה", types: "למינציה, Low-E, צבועה", leadDays: 18, priceIndex: 112, quality: 4.7, onTime: 88, orders: 8, volume: 3800 },
  { id: 4, name: "פניציה זכוכית", region: "ירוחם", types: "פלואט, צבועה, חלבית", leadDays: 3, priceIndex: 92, quality: 4.5, onTime: 97, orders: 32, volume: 11200 },
  { id: 5, name: "Saint-Gobain", region: "יבוא - צרפת", types: "מחוסם, למינציה, Low-E", leadDays: 25, priceIndex: 118, quality: 4.9, onTime: 85, orders: 6, volume: 2900 },
];

const SC: Record<string, string> = {
  "תקין": "bg-green-500/20 text-green-300 border-green-500/30",
  "נמוך": "bg-red-500/20 text-red-300 border-red-500/30",
};

/* ── Component ──────────────────────────────────────────────────────── */
export default function FabGlassCatalog() {
  const { data: apiglassCatalog } = useQuery({
    queryKey: ["/api/fabrication/fab-glass-catalog/glasscatalog"],
    queryFn: () => authFetch("/api/fabrication/fab-glass-catalog/glasscatalog").then(r => r.json()).catch(() => null),
  });
  const glassCatalog = Array.isArray(apiglassCatalog) ? apiglassCatalog : (apiglassCatalog?.data ?? apiglassCatalog?.items ?? FALLBACK_GLASSCATALOG);


  const { data: apiiguConfigs } = useQuery({
    queryKey: ["/api/fabrication/fab-glass-catalog/iguconfigs"],
    queryFn: () => authFetch("/api/fabrication/fab-glass-catalog/iguconfigs").then(r => r.json()).catch(() => null),
  });
  const iguConfigs = Array.isArray(apiiguConfigs) ? apiiguConfigs : (apiiguConfigs?.data ?? apiiguConfigs?.items ?? FALLBACK_IGUCONFIGS);


  const { data: apistockItems } = useQuery({
    queryKey: ["/api/fabrication/fab-glass-catalog/stockitems"],
    queryFn: () => authFetch("/api/fabrication/fab-glass-catalog/stockitems").then(r => r.json()).catch(() => null),
  });
  const stockItems = Array.isArray(apistockItems) ? apistockItems : (apistockItems?.data ?? apistockItems?.items ?? FALLBACK_STOCKITEMS);


  const { data: apisuppliers } = useQuery({
    queryKey: ["/api/fabrication/fab-glass-catalog/suppliers"],
    queryFn: () => authFetch("/api/fabrication/fab-glass-catalog/suppliers").then(r => r.json()).catch(() => null),
  });
  const suppliers = Array.isArray(apisuppliers) ? apisuppliers : (apisuppliers?.data ?? apisuppliers?.items ?? FALLBACK_SUPPLIERS);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tab, setTab] = useState("catalog");

  const totalM2 = glassCatalog.reduce((s, g) => s + g.stockM2, 0);
  const stockValue = glassCatalog.reduce((s, g) => s + g.stockM2 * g.priceM2, 0);
  const lowStockCount = glassCatalog.filter(g => g.status === "נמוך").length;
  const uniqueTypes = [...new Set(glassCatalog.map(g => g.type))];
  const pendingOrders = stockItems.filter(s => s.incoming > 0).length;

  const filteredCatalog = useMemo(() => {
    return glassCatalog.filter(g => {
      if (typeFilter !== "all" && g.type !== typeFilter) return false;
      if (search && !g.name.includes(search) && !g.type.includes(search)) return false;
      return true;
    });
  }, [search, typeFilter]);

  const kpis = [
    { label: "סוגי זכוכית", value: glassCatalog.length, icon: Layers, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: 'סה"כ מ"ר במלאי', value: totalM2.toLocaleString(), icon: Package, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "שווי מלאי", value: `${(stockValue / 1000).toFixed(0)}K ₪`, icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "ספקים", value: suppliers.length, icon: Truck, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "מלאי נמוך", value: lowStockCount, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "הזמנות בדרך", value: pendingOrders, icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">קטלוג זכוכית</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול סוגי זכוכית, תצורות IGU, מלאי וספקים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />הוספת סוג</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <div className={`p-1.5 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="catalog">קטלוג זכוכית</TabsTrigger>
          <TabsTrigger value="igu">תצורות IGU</TabsTrigger>
          <TabsTrigger value="stock">ניהול מלאי</TabsTrigger>
          <TabsTrigger value="suppliers">ספקים</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Catalog ─────────────────────────────────────────── */}
        <TabsContent value="catalog" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש זכוכית..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסוגים</option>
              {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid gap-4">
            {filteredCatalog.map(g => (
              <Card key={g.id} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-foreground">{g.name}</h3>
                        <Badge variant="outline" className="text-xs">{g.type}</Badge>
                        <Badge className={SC[g.status] || ""}>{g.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Ruler className="w-3.5 h-3.5" />
                          <span>עובי: <span className="text-foreground font-medium">{g.thickness} מ"מ</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Weight className="w-3.5 h-3.5" />
                          <span>משקל: <span className="text-foreground font-medium">{g.weight} ק"ג/מ"ר</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <ThermometerSun className="w-3.5 h-3.5" />
                          <span>U-Value: <span className="text-foreground font-medium">{g.uValue}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Package className="w-3.5 h-3.5" />
                          <span>מלאי: <span className="text-foreground font-medium">{g.stockM2.toLocaleString()} מ"ר</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>מחיר: <span className="text-foreground font-medium">{g.priceM2} ₪/מ"ר</span></span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 2: IGU Configurations ──────────────────────────────── */}
        <TabsContent value="igu" className="space-y-4 mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">תצורות זיגוג מבודד (IGU)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">תצורה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עובי כולל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ספייסר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מילוי גז</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">U-Value</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">משקל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחיר/מ"ר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פופולריות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iguConfigs.map(igu => (
                      <tr key={igu.id} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 font-medium text-foreground">{igu.name}</td>
                        <td className="p-3 text-foreground">{igu.totalMm} מ"מ</td>
                        <td className="p-3">
                          <Badge variant="outline" className={igu.spacerType === "Warm Edge" ? "text-emerald-300 border-emerald-500/30" : "text-muted-foreground"}>
                            {igu.spacerType}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={igu.gasFill === "ארגון" ? "text-blue-300 border-blue-500/30" : "text-muted-foreground"}>
                            {igu.gasFill}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className={`font-medium ${igu.uValue <= 1.1 ? "text-emerald-400" : igu.uValue <= 1.5 ? "text-blue-400" : "text-foreground"}`}>
                            {igu.uValue}
                          </span>
                        </td>
                        <td className="p-3 text-foreground">{igu.weight} ק"ג/מ"ר</td>
                        <td className="p-3 text-foreground font-medium">{igu.priceM2} ₪</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={igu.popularity} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-8">{igu.popularity}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">ביצועים תרמיים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {iguConfigs.slice(0, 5).map(igu => (
                  <div key={igu.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{igu.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-muted/30 rounded-full h-2">
                        <div className="h-2 rounded-full bg-gradient-to-l from-emerald-500 to-blue-500" style={{ width: `${Math.max(5, 100 - igu.uValue * 18)}%` }} />
                      </div>
                      <span className="font-medium text-foreground w-10 text-left">{igu.uValue}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">השוואת עלות מול U-Value</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {iguConfigs.slice(0, 5).map(igu => (
                  <div key={igu.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{igu.name}</span>
                    <Badge variant="outline" className="text-xs">{igu.priceM2} ₪ | {(igu.priceM2 / (5.8 - igu.uValue)).toFixed(0)} ₪/U</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 3: Stock Management ────────────────────────────────── */}
        <TabsContent value="stock" className="space-y-4 mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">מצב מלאי לפי סוג</CardTitle>
                <Button variant="outline" size="sm"><ArrowUpDown className="w-3.5 h-3.5 ml-1" />מיון</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stockItems.map((s, idx) => {
                  const pct = Math.min(100, (s.inStock / (s.minLevel * 3)) * 100);
                  const isLow = s.inStock <= s.minLevel * 1.2;
                  const monthsLeft = (s.inStock / s.monthlyUse).toFixed(1);
                  return (
                    <div key={idx} className="p-3 rounded-lg border border-border/30 bg-background/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground text-sm">{s.type}</span>
                          {isLow && <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">מלאי נמוך</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">{monthsLeft} חודשים במלאי</span>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <Progress value={pct} className="h-2.5 flex-1" />
                        <span className="text-sm font-medium text-foreground w-20 text-left">{s.inStock.toLocaleString()} מ"ר</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>מינימום: {s.minLevel} מ"ר</span>
                        <span>צריכה חודשית: {s.monthlyUse} מ"ר</span>
                        {s.incoming > 0 ? (
                          <span className="text-blue-400">בדרך: {s.incoming} מ"ר (ETA {s.eta})</span>
                        ) : (
                          <span>אין הזמנות פתוחות</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm">הזמנות נכנסות</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-2">
                {stockItems.filter(s => s.incoming > 0).map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-blue-500/5 border border-blue-500/10">
                    <div>
                      <span className="text-sm text-foreground font-medium">{s.type}</span>
                      <span className="text-xs text-muted-foreground mr-2">{s.incoming} מ"ר</span>
                    </div>
                    <Badge variant="outline" className="text-blue-300 border-blue-500/30 text-xs">
                      <Clock className="w-3 h-3 ml-1" />{s.eta}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Suppliers ───────────────────────────────────────── */}
        <TabsContent value="suppliers" className="space-y-4 mt-4">
          <div className="grid gap-4">
            {suppliers.map(sup => (
              <Card key={sup.id} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{sup.name}</h3>
                      <span className="text-xs text-muted-foreground">{sup.region}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span className="text-sm font-medium text-foreground">{sup.quality}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {sup.types.split(", ").map(t => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block">זמן אספקה</span>
                      <span className="font-medium text-foreground">{sup.leadDays} ימים</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">מדד מחיר</span>
                      <span className={`font-medium ${sup.priceIndex <= 100 ? "text-emerald-400" : "text-foreground"}`}>{sup.priceIndex}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">אמינות אספקה</span>
                      <span className={`font-medium ${sup.onTime >= 95 ? "text-emerald-400" : sup.onTime >= 90 ? "text-blue-400" : "text-amber-400"}`}>{sup.onTime}%</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">הזמנות (שנה)</span>
                      <span className="font-medium text-foreground">{sup.orders}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">נפח שנתי</span>
                      <span className="font-medium text-foreground">{sup.volume.toLocaleString()} מ"ר</span>
                    </div>
                  </div>
                  <Progress value={sup.onTime} className="h-1.5 mt-3" />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}