import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Boxes, Package, AlertTriangle, TrendingDown, Factory,
  Layers, ShieldCheck, Zap, Wrench, Paintbrush, Cog,
  Recycle, ArrowUpRight, ArrowDownRight, Eye
} from "lucide-react";

// ============================================================
// RAW MATERIALS DATA — טכנו-כל עוזי
// ============================================================

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

const FALLBACK_KPIS = [
  { label: "סה\"כ חומרי גלם", value: "1,247", icon: Package, color: "text-blue-400" },
  { label: "פעילים", value: "1,089", icon: ShieldCheck, color: "text-green-400" },
  { label: "מלאי נמוך", value: "64", icon: TrendingDown, color: "text-amber-400" },
  { label: "אזל מהמלאי", value: "18", icon: AlertTriangle, color: "text-red-400" },
  { label: "שווי כולל", value: fmt(4_825_000), icon: Layers, color: "text-purple-400" },
  { label: "עלות ממוצעת/ק\"ג", value: fmt(38.5), icon: Factory, color: "text-cyan-400" },
  { label: "קטגוריות", value: "8", icon: Boxes, color: "text-indigo-400" },
  { label: "ספקים ממופים", value: "42", icon: Wrench, color: "text-emerald-400" },
];

interface Category {
  id: string;
  name: string;
  icon: React.ElementType;
  items: number;
  value: number;
  lowStock: number;
  topSupplier: string;
  color: string;
}

const categories: Category[] = [
  { id: "iron", name: "פרופילי ברזל", icon: Factory, items: 214, value: 920_000, lowStock: 12, topSupplier: "מפעלי ברזל השרון", color: "border-orange-500/50" },
  { id: "aluminum", name: "פרופילי אלומיניום", icon: Layers, items: 189, value: 1_150_000, lowStock: 8, topSupplier: "Alumil SA", color: "border-sky-500/50" },
  { id: "stainless", name: "נירוסטה", icon: ShieldCheck, items: 97, value: 480_000, lowStock: 5, topSupplier: "Acerinox", color: "border-slate-400/50" },
  { id: "glass", name: "זכוכית", icon: Eye, items: 142, value: 870_000, lowStock: 11, topSupplier: "Foshan Glass Co.", color: "border-cyan-500/50" },
  { id: "hardware", name: "פרזול ואביזרים", icon: Wrench, items: 268, value: 540_000, lowStock: 14, topSupplier: "Hafele", color: "border-amber-500/50" },
  { id: "finish", name: "חומרי גמר", icon: Paintbrush, items: 156, value: 310_000, lowStock: 6, topSupplier: "AkzoNobel", color: "border-pink-500/50" },
  { id: "motors", name: "מנועים וחשמל", icon: Zap, items: 83, value: 385_000, lowStock: 4, topSupplier: "Somfy", color: "border-yellow-500/50" },
  { id: "consumables", name: "מתכלים", icon: Recycle, items: 98, value: 170_000, lowStock: 4, topSupplier: "3M Israel", color: "border-green-500/50" },
];

interface AttentionItem {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  unit: string;
  lastOrder: string;
  reorderStatus: "הוזמן" | "ממתין לאישור" | "לא הוזמן";
  daysUntilOut: number;
}

const FALLBACK_ATTENTION_ITEMS: AttentionItem[] = [
  { id: "RM-0012", name: "פרופיל ברזל 40x40x2", category: "פרופילי ברזל", currentStock: 45, minStock: 200, unit: "מטר", lastOrder: "2026-03-18", reorderStatus: "הוזמן", daysUntilOut: 4 },
  { id: "RM-0087", name: "זכוכית מחוסמת 10מ\"מ", category: "זכוכית", currentStock: 12, minStock: 80, unit: "יח׳", lastOrder: "2026-03-22", reorderStatus: "ממתין לאישור", daysUntilOut: 2 },
  { id: "RM-0134", name: "פרופיל אלומיניום תרמי 60", category: "פרופילי אלומיניום", currentStock: 30, minStock: 150, unit: "מטר", lastOrder: "2026-03-10", reorderStatus: "לא הוזמן", daysUntilOut: 5 },
  { id: "RM-0201", name: "ציר נסתר 3D", category: "פרזול ואביזרים", currentStock: 18, minStock: 100, unit: "יח׳", lastOrder: "2026-02-28", reorderStatus: "לא הוזמן", daysUntilOut: 3 },
  { id: "RM-0056", name: "נירוסטה 304 פס 30x3", category: "נירוסטה", currentStock: 22, minStock: 100, unit: "מטר", lastOrder: "2026-03-15", reorderStatus: "הוזמן", daysUntilOut: 6 },
  { id: "RM-0310", name: "מנוע סומפי RTS 20Nm", category: "מנועים וחשמל", currentStock: 5, minStock: 30, unit: "יח׳", lastOrder: "2026-03-20", reorderStatus: "ממתין לאישור", daysUntilOut: 1 },
  { id: "RM-0245", name: "דיסק חיתוך 230מ\"מ", category: "מתכלים", currentStock: 40, minStock: 200, unit: "יח׳", lastOrder: "2026-03-25", reorderStatus: "הוזמן", daysUntilOut: 7 },
  { id: "RM-0098", name: "צבע אפוקסי RAL 7016", category: "חומרי גמר", currentStock: 8, minStock: 50, unit: "ליטר", lastOrder: "2026-03-05", reorderStatus: "לא הוזמן", daysUntilOut: 2 },
];

const statusColor = (s: AttentionItem["reorderStatus"]) => {
  if (s === "הוזמן") return "bg-green-600/20 text-green-400 border-green-600/30";
  if (s === "ממתין לאישור") return "bg-amber-600/20 text-amber-400 border-amber-600/30";
  return "bg-red-600/20 text-red-400 border-red-600/30";
};

const urgencyColor = (days: number) => {
  if (days <= 2) return "text-red-400";
  if (days <= 5) return "text-amber-400";
  return "text-slate-300";
};

// ============================================================
// COMPONENT
// ============================================================

export default function RawMaterialsDashboard() {
  const { data: rawmaterialsdashboardData } = useQuery({
    queryKey: ["raw-materials-dashboard"],
    queryFn: () => authFetch("/api/procurement/raw_materials_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = rawmaterialsdashboardData ?? FALLBACK_KPIS;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredItems = selectedCategory
    ? attentionItems.filter((i) => i.category === selectedCategory)
    : attentionItems;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 space-y-6">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-600/20 border border-blue-500/30">
          <Boxes className="h-6 w-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">לוח בקרה — חומרי גלם</h1>
          <p className="text-sm text-slate-400">טכנו-כל עוזי · מפעל מתכת / אלומיניום / זכוכית</p>
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex flex-col items-center text-center gap-1">
              <k.icon className={`h-5 w-5 ${k.color}`} />
              <span className="text-lg font-bold text-white">{k.value}</span>
              <span className="text-[11px] text-slate-400 leading-tight">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Categories Grid ────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">קטגוריות חומרי גלם</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const stockPct = Math.round(((cat.items - cat.lowStock) / cat.items) * 100);
            const isSelected = selectedCategory === cat.name;
            return (
              <Card
                key={cat.id}
                onClick={() => setSelectedCategory(isSelected ? null : cat.name)}
                className={`bg-slate-800/50 border-slate-700 cursor-pointer transition-all hover:border-slate-500 ${
                  isSelected ? `ring-2 ring-blue-500 ${cat.color}` : ""
                }`}
              >
                <CardHeader className="pb-2 flex flex-row items-center gap-3">
                  <div className={`p-2 rounded-md bg-slate-700/60 border ${cat.color}`}>
                    <cat.icon className="h-5 w-5 text-slate-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-semibold text-white truncate">{cat.name}</CardTitle>
                    <p className="text-xs text-slate-400 mt-0.5">{cat.items} פריטים</p>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">שווי</span>
                    <span className="text-white font-medium">{fmt(cat.value)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">מלאי נמוך</span>
                    <span className={cat.lowStock > 10 ? "text-red-400 font-medium" : "text-amber-400 font-medium"}>
                      {cat.lowStock} פריטים
                    </span>
                  </div>
                  <Progress value={stockPct} className="h-1.5 bg-slate-700" />
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">ספק מוביל</span>
                    <span className="text-slate-300 truncate max-w-[120px]">{cat.topSupplier}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Attention Items Table ───────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">פריטים דורשים תשומת לב</h2>
          {selectedCategory && (
            <Badge
              variant="outline"
              className="mr-2 border-blue-500/50 text-blue-400 cursor-pointer"
              onClick={() => setSelectedCategory(null)}
            >
              {selectedCategory} ✕
            </Badge>
          )}
          <span className="text-xs text-slate-500 mr-auto">{filteredItems.length} פריטים</span>
        </div>

        <Card className="bg-slate-800/50 border-slate-700 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-slate-400 text-right">מק\"ט</TableHead>
                <TableHead className="text-slate-400 text-right">שם פריט</TableHead>
                <TableHead className="text-slate-400 text-right">קטגוריה</TableHead>
                <TableHead className="text-slate-400 text-center">מלאי נוכחי</TableHead>
                <TableHead className="text-slate-400 text-center">מינימום</TableHead>
                <TableHead className="text-slate-400 text-center">ימים עד אזילה</TableHead>
                <TableHead className="text-slate-400 text-center">סטטוס הזמנה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => {
                const stockPct = Math.round((item.currentStock / item.minStock) * 100);
                return (
                  <TableRow key={item.id} className="border-slate-700/50 hover:bg-slate-700/30">
                    <TableCell className="text-slate-300 font-mono text-xs">{item.id}</TableCell>
                    <TableCell className="text-white font-medium text-sm">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-white text-sm">
                          {item.currentStock} {item.unit}
                        </span>
                        <Progress value={stockPct} className="h-1 w-16 bg-slate-700" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-slate-400 text-sm">
                      {item.minStock} {item.unit}
                    </TableCell>
                    <TableCell className={`text-center font-bold text-sm ${urgencyColor(item.daysUntilOut)}`}>
                      {item.daysUntilOut}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={`text-xs ${statusColor(item.reorderStatus)}`}>
                        {item.reorderStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                    אין פריטים להצגה בקטגוריה זו
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
