import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Package, Search, Filter, TrendingUp, Image, CheckCircle2,
  XCircle, BarChart3, Layers, ShoppingBag, Wrench, Zap
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCurrency = (v: number) => "\u20AA" + fmt(v);
const fmtPercent = (v: number) => v.toFixed(1) + "%";

// ============================================================
// TYPES
// ============================================================
interface Product {
  product_code: string;
  product_name: string;
  category: string;
  subcategory: string;
  product_type: string;
  default_material: string;
  base_cost: number;
  sale_price: number;
  gross_margin: number;
  image_thumbnail: string;
  active_status: "active" | "inactive" | "discontinued";
}

// ============================================================
// MOCK DATA - Products Master for Techno-Kol Uzi Factory
// ============================================================
const products: Product[] = [
  // --- Iron ---
  { product_code: "PRD-1001", product_name: "שער כניסה דגם Premium", category: "ברזל", subcategory: "שערים", product_type: "מוצר סטנדרטי", default_material: "ברזל מגולוון", base_cost: 4200, sale_price: 7800, gross_margin: 46.2, image_thumbnail: "gate-premium.jpg", active_status: "active" },
  { product_code: "PRD-1002", product_name: "גדר ברזל 1.5m", category: "ברזל", subcategory: "גדרות", product_type: "מוצר סטנדרטי", default_material: "ברזל שחור", base_cost: 850, sale_price: 1650, gross_margin: 48.5, image_thumbnail: "fence-150.jpg", active_status: "active" },
  { product_code: "PRD-1003", product_name: "מעקה מדרגות קלאסי", category: "ברזל", subcategory: "מעקות", product_type: "מוצר סטנדרטי", default_material: "ברזל מרוקע", base_cost: 1800, sale_price: 3200, gross_margin: 43.8, image_thumbnail: "railing-classic.jpg", active_status: "active" },
  { product_code: "PRD-1004", product_name: "פרגולת ברזל 4x3", category: "ברזל", subcategory: "פרגולות", product_type: "מוצר מורכב", default_material: "ברזל מגולוון", base_cost: 6500, sale_price: 12800, gross_margin: 49.2, image_thumbnail: "pergola-4x3.jpg", active_status: "active" },
  // --- Aluminum ---
  { product_code: "PRD-2001", product_name: "חלון בלגי 120x150", category: "אלומיניום", subcategory: "חלונות", product_type: "מוצר סטנדרטי", default_material: "אלומיניום 6063-T5", base_cost: 1350, sale_price: 2400, gross_margin: 43.8, image_thumbnail: "window-belgi.jpg", active_status: "active" },
  { product_code: "PRD-2002", product_name: "דלת בלגית 100x220", category: "אלומיניום", subcategory: "דלתות", product_type: "מוצר סטנדרטי", default_material: "אלומיניום 6063-T5", base_cost: 2100, sale_price: 3800, gross_margin: 44.7, image_thumbnail: "door-belgi.jpg", active_status: "active" },
  { product_code: "PRD-2003", product_name: "חזית אלומיניום", category: "אלומיניום", subcategory: "חזיתות", product_type: "מוצר מורכב", default_material: "אלומיניום תרמי", base_cost: 3800, sale_price: 7200, gross_margin: 47.2, image_thumbnail: "facade-alu.jpg", active_status: "active" },
  { product_code: "PRD-2004", product_name: "מעקה אלומיניום", category: "אלומיניום", subcategory: "מעקות", product_type: "מוצר סטנדרטי", default_material: "אלומיניום אנודייז", base_cost: 950, sale_price: 1750, gross_margin: 45.7, image_thumbnail: "railing-alu.jpg", active_status: "active" },
  // --- Glass ---
  { product_code: "PRD-3001", product_name: "מעקה זכוכית 1.2m", category: "זכוכית", subcategory: "מעקות", product_type: "מוצר סטנדרטי", default_material: "זכוכית מחוסמת 12mm", base_cost: 2200, sale_price: 4100, gross_margin: 46.3, image_thumbnail: "railing-glass.jpg", active_status: "active" },
  { product_code: "PRD-3002", product_name: "מקלחון חזית 90x200", category: "זכוכית", subcategory: "מקלחונים", product_type: "מוצר סטנדרטי", default_material: "זכוכית מחוסמת 8mm", base_cost: 1600, sale_price: 2950, gross_margin: 45.8, image_thumbnail: "shower-front.jpg", active_status: "active" },
  { product_code: "PRD-3003", product_name: "מחיצת זכוכית", category: "זכוכית", subcategory: "מחיצות", product_type: "מוצר מורכב", default_material: "זכוכית למינציה 10mm", base_cost: 3400, sale_price: 6200, gross_margin: 45.2, image_thumbnail: "partition-glass.jpg", active_status: "inactive" },
  // --- Motorized ---
  { product_code: "PRD-4001", product_name: "שער חשמלי הזזה 5m", category: "ממונע", subcategory: "שערים חשמליים", product_type: "מוצר מורכב", default_material: "ברזל מגולוון + מנוע", base_cost: 8500, sale_price: 16500, gross_margin: 48.5, image_thumbnail: "gate-electric.jpg", active_status: "active" },
  { product_code: "PRD-4002", product_name: "מערכת גלילה", category: "ממונע", subcategory: "תריסים", product_type: "מוצר מורכב", default_material: "אלומיניום + מנוע Somfy", base_cost: 2800, sale_price: 5200, gross_margin: 46.2, image_thumbnail: "roller-system.jpg", active_status: "active" },
  // --- Custom ---
  { product_code: "PRD-9001", product_name: "שער בהתאמה אישית", category: "ברזל", subcategory: "שערים", product_type: "התאמה אישית", default_material: "לפי הזמנה", base_cost: 5500, sale_price: 11000, gross_margin: 50.0, image_thumbnail: "gate-custom.jpg", active_status: "active" },
];

// ============================================================
// HELPERS
// ============================================================
const categoryConfig: Record<string, { color: string; icon: typeof Package }> = {
  "ברזל":     { color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: Wrench },
  "אלומיניום": { color: "bg-sky-500/20 text-sky-400 border-sky-500/30", icon: Layers },
  "זכוכית":   { color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30", icon: Package },
  "ממונע":    { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Zap },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  active:       { label: "פעיל",    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  inactive:     { label: "לא פעיל", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  discontinued: { label: "הופסק",   className: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const marginColor = (m: number) => {
  if (m >= 48) return "text-emerald-400";
  if (m >= 44) return "text-sky-400";
  return "text-amber-400";
};

const marginBg = (m: number) => {
  if (m >= 48) return "bg-emerald-500";
  if (m >= 44) return "bg-sky-500";
  return "bg-amber-500";
};

// ============================================================
// KPIs
// ============================================================
const totalProducts = products.length;
const activeProducts = products.filter(p => p.active_status === "active").length;
const avgMargin = products.reduce((s, p) => s + p.gross_margin, 0) / totalProducts;
const totalRevenuePotential = products.filter(p => p.active_status === "active").reduce((s, p) => s + p.sale_price, 0);
const categories = [...new Set(products.map(p => p.category))];

const kpis = [
  { label: "סה\"כ מוצרים", value: totalProducts.toString(), sub: `${activeProducts} פעילים`, icon: Package, gradient: "from-blue-600 to-blue-800" },
  { label: "מרווח גולמי ממוצע", value: fmtPercent(avgMargin), sub: "על פני כל המוצרים", icon: TrendingUp, gradient: "from-emerald-600 to-emerald-800" },
  { label: "פוטנציאל הכנסה", value: fmtCurrency(totalRevenuePotential), sub: "מוצרים פעילים", icon: BarChart3, gradient: "from-purple-600 to-purple-800" },
  { label: "קטגוריות", value: categories.length.toString(), sub: "ברזל, אלומיניום, זכוכית, ממונע", icon: Layers, gradient: "from-amber-600 to-amber-800" },
];

// ============================================================
// COMPONENT
// ============================================================
export default function ProductsList() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = products.filter(p => {
    const matchTab = activeTab === "all" || p.category === activeTab;
    const matchSearch =
      !search ||
      p.product_name.includes(search) ||
      p.product_code.toLowerCase().includes(search.toLowerCase()) ||
      p.subcategory.includes(search) ||
      p.default_material.includes(search);
    return matchTab && matchSearch;
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-blue-400" />
            קטלוג מוצרים - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            ניהול מאסטר מוצרים | {totalProducts} פריטים | עדכון אחרון: 08/04/2026
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש מוצר, קוד, חומר..."
              className="bg-gray-800/60 border border-gray-700 rounded-lg pr-10 pl-4 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-72"
            />
          </div>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <Filter className="w-4 h-4" />
            סינון
          </button>
        </div>
      </div>

      {/* ---- KPI Cards ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-gradient-to-br border-0 text-white shadow-lg" style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))` }}>
            <div className={`bg-gradient-to-br ${k.gradient} rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-300">{k.label}</span>
                <k.icon className="w-5 h-5 text-gray-300/70" />
              </div>
              <div className="text-2xl font-bold">{k.value}</div>
              <div className="text-xs text-gray-300 mt-1">{k.sub}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* ---- Tabs & Table ---- */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-800/60 border border-gray-700 p-1">
          <TabsTrigger value="all" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400">
            כל המוצרים ({products.length})
          </TabsTrigger>
          <TabsTrigger value="ברזל" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white text-gray-400">
            ברזל ({products.filter(p => p.category === "ברזל").length})
          </TabsTrigger>
          <TabsTrigger value="אלומיניום" className="data-[state=active]:bg-sky-600 data-[state=active]:text-white text-gray-400">
            אלומיניום ({products.filter(p => p.category === "אלומיניום").length})
          </TabsTrigger>
          <TabsTrigger value="זכוכית" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400">
            זכוכית ({products.filter(p => p.category === "זכוכית").length})
          </TabsTrigger>
          <TabsTrigger value="ממונע" className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white text-gray-400">
            ממונע ({products.filter(p => p.category === "ממונע").length})
          </TabsTrigger>
        </TabsList>

        {/* Shared content for all tabs - filtered by activeTab */}
        {["all", "ברזל", "אלומיניום", "זכוכית", "ממונע"].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-400" />
                  {tab === "all" ? "כל המוצרים" : `מוצרי ${tab}`}
                  <Badge variant="outline" className="bg-gray-800/60 text-gray-300 border-gray-700 mr-2">
                    {filtered.length} פריטים
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="text-gray-400 text-right font-medium">תמונה</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">קוד מוצר</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">שם מוצר</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">קטגוריה</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">תת-קטגוריה</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">סוג</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">חומר ברירת מחדל</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">עלות בסיס</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">מחיר מכירה</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">מרווח גולמי</TableHead>
                        <TableHead className="text-gray-400 text-right font-medium">סטטוס</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(p => {
                        const cat = categoryConfig[p.category] || { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Package };
                        const CatIcon = cat.icon;
                        const st = statusConfig[p.active_status];
                        return (
                          <TableRow key={p.product_code} className="border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            {/* Thumbnail */}
                            <TableCell>
                              <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                                <Image className="w-5 h-5 text-gray-500" />
                              </div>
                            </TableCell>
                            {/* Code */}
                            <TableCell className="font-mono text-sm text-blue-400 font-medium">
                              {p.product_code}
                            </TableCell>
                            {/* Name */}
                            <TableCell className="text-white font-medium text-sm max-w-[200px]">
                              {p.product_name}
                            </TableCell>
                            {/* Category badge */}
                            <TableCell>
                              <Badge variant="outline" className={`${cat.color} text-xs flex items-center gap-1 w-fit`}>
                                <CatIcon className="w-3 h-3" />
                                {p.category}
                              </Badge>
                            </TableCell>
                            {/* Subcategory */}
                            <TableCell className="text-gray-300 text-sm">
                              {p.subcategory}
                            </TableCell>
                            {/* Product type */}
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                p.product_type === "התאמה אישית"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : p.product_type === "מוצר מורכב"
                                    ? "bg-cyan-500/20 text-cyan-400"
                                    : "bg-gray-700/50 text-gray-400"
                              }`}>
                                {p.product_type}
                              </span>
                            </TableCell>
                            {/* Material */}
                            <TableCell className="text-gray-300 text-sm">
                              {p.default_material}
                            </TableCell>
                            {/* Base cost */}
                            <TableCell className="text-gray-300 text-sm font-mono">
                              {fmtCurrency(p.base_cost)}
                            </TableCell>
                            {/* Sale price */}
                            <TableCell className="text-white text-sm font-mono font-semibold">
                              {fmtCurrency(p.sale_price)}
                            </TableCell>
                            {/* Gross margin */}
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${marginColor(p.gross_margin)}`}>
                                  {fmtPercent(p.gross_margin)}
                                </span>
                                <div className="w-16">
                                  <Progress
                                    value={p.gross_margin}
                                    className="h-1.5 bg-gray-800"
                                    style={{ ["--progress-background" as string]: undefined }}
                                  />
                                  <div
                                    className={`h-1.5 rounded-full ${marginBg(p.gross_margin)} -mt-1.5`}
                                    style={{ width: `${Math.min(p.gross_margin, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            {/* Status */}
                            <TableCell>
                              <Badge variant="outline" className={`${st.className} text-xs flex items-center gap-1 w-fit`}>
                                {p.active_status === "active"
                                  ? <CheckCircle2 className="w-3 h-3" />
                                  : <XCircle className="w-3 h-3" />}
                                {st.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {filtered.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>לא נמצאו מוצרים</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* ---- Category Breakdown Summary ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map(cat => {
          const catProducts = products.filter(p => p.category === cat);
          const conf = categoryConfig[cat] || { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Package };
          const CatIcon = conf.icon;
          const catAvgMargin = catProducts.reduce((s, p) => s + p.gross_margin, 0) / catProducts.length;
          const catActive = catProducts.filter(p => p.active_status === "active").length;
          const catRevenue = catProducts.filter(p => p.active_status === "active").reduce((s, p) => s + p.sale_price, 0);

          return (
            <Card key={cat} className="bg-gray-900/50 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-2 rounded-lg ${conf.color.split(" ")[0]}`}>
                    <CatIcon className="w-4 h-4 text-gray-300" />
                  </div>
                  <span className="text-white font-semibold">{cat}</span>
                  <Badge variant="outline" className="bg-gray-800/60 text-gray-400 border-gray-700 mr-auto text-xs">
                    {catProducts.length} מוצרים
                  </Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">פעילים</span>
                    <span className="text-emerald-400 font-medium">{catActive}/{catProducts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">מרווח ממוצע</span>
                    <span className={`font-medium ${marginColor(catAvgMargin)}`}>{fmtPercent(catAvgMargin)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">פוטנציאל הכנסה</span>
                    <span className="text-white font-medium">{fmtCurrency(catRevenue)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
