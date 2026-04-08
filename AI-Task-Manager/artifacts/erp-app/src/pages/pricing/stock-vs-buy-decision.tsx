import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Scale, Package, ShoppingCart, Ship, Warehouse, TrendingDown,
  CheckCircle2, AlertTriangle, Clock, DollarSign, ArrowLeftRight,
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");

type Source = "מלאי" | "רכישה" | "יבוא";

interface Material {
  name: string;
  unit: string;
  qtyNeeded: number;
  stockAvailable: number;
  stockCostPerUnit: number;
  buyCostPerUnit: number;
  importCostPerUnit: number;
  stockLeadDays: number;
  buyLeadDays: number;
  importLeadDays: number;
}

interface Project {
  id: string;
  name: string;
  client: string;
  materials: Material[];
}

const projects: Project[] = [
  {
    id: "PRJ-1052", name: "שער חשמלי תעשייתי — מפעל שטראוס", client: "שטראוס גרופ",
    materials: [
      { name: "פלדה מגולוונת 3 מ\"מ", unit: "ק\"ג", qtyNeeded: 420, stockAvailable: 310, stockCostPerUnit: 18, buyCostPerUnit: 21, importCostPerUnit: 16.5, stockLeadDays: 0, buyLeadDays: 5, importLeadDays: 28 },
      { name: "מנוע חשמלי 1.5HP", unit: "יח'", qtyNeeded: 2, stockAvailable: 3, stockCostPerUnit: 2800, buyCostPerUnit: 3100, importCostPerUnit: 2450, stockLeadDays: 0, buyLeadDays: 7, importLeadDays: 35 },
      { name: "בקר PLC S7-1200", unit: "יח'", qtyNeeded: 1, stockAvailable: 0, stockCostPerUnit: 4200, buyCostPerUnit: 4500, importCostPerUnit: 3800, stockLeadDays: 0, buyLeadDays: 10, importLeadDays: 42 },
      { name: "צבע אלקטרוסטטי RAL7016", unit: "ליטר", qtyNeeded: 25, stockAvailable: 40, stockCostPerUnit: 85, buyCostPerUnit: 92, importCostPerUnit: 78, stockLeadDays: 0, buyLeadDays: 3, importLeadDays: 21 },
      { name: "חישוקי נירוסטה M12", unit: "יח'", qtyNeeded: 48, stockAvailable: 20, stockCostPerUnit: 14, buyCostPerUnit: 16, importCostPerUnit: 11, stockLeadDays: 0, buyLeadDays: 4, importLeadDays: 25 },
      { name: "כבל חשמלי 3x2.5", unit: "מטר", qtyNeeded: 60, stockAvailable: 100, stockCostPerUnit: 8.5, buyCostPerUnit: 9.2, importCostPerUnit: 7.8, stockLeadDays: 0, buyLeadDays: 2, importLeadDays: 18 },
      { name: "חיישן פוטואלקטרי", unit: "יח'", qtyNeeded: 4, stockAvailable: 1, stockCostPerUnit: 420, buyCostPerUnit: 480, importCostPerUnit: 350, stockLeadDays: 0, buyLeadDays: 8, importLeadDays: 30 },
      { name: "גלגלת הנעה D80", unit: "יח'", qtyNeeded: 4, stockAvailable: 6, stockCostPerUnit: 195, buyCostPerUnit: 230, importCostPerUnit: 170, stockLeadDays: 0, buyLeadDays: 6, importLeadDays: 32 },
    ],
  },
  {
    id: "PRJ-1058", name: "מעקה נירוסטה — קניון הזהב", client: "קניון הזהב בע\"מ",
    materials: [
      { name: "צינור נירוסטה 316 50x2", unit: "מטר", qtyNeeded: 180, stockAvailable: 50, stockCostPerUnit: 62, buyCostPerUnit: 68, importCostPerUnit: 55, stockLeadDays: 0, buyLeadDays: 7, importLeadDays: 30 },
      { name: "זכוכית מחוסמת 12 מ\"מ", unit: "מ\"ר", qtyNeeded: 32, stockAvailable: 0, stockCostPerUnit: 380, buyCostPerUnit: 410, importCostPerUnit: 340, stockLeadDays: 0, buyLeadDays: 14, importLeadDays: 45 },
      { name: "מחזיקי זכוכית נירוסטה", unit: "יח'", qtyNeeded: 64, stockAvailable: 80, stockCostPerUnit: 45, buyCostPerUnit: 52, importCostPerUnit: 38, stockLeadDays: 0, buyLeadDays: 5, importLeadDays: 28 },
      { name: "בורג אלן M8 נירוסטה", unit: "יח'", qtyNeeded: 200, stockAvailable: 500, stockCostPerUnit: 3.2, buyCostPerUnit: 3.8, importCostPerUnit: 2.5, stockLeadDays: 0, buyLeadDays: 2, importLeadDays: 20 },
      { name: "פלטת עיגון 150x150x10", unit: "יח'", qtyNeeded: 24, stockAvailable: 10, stockCostPerUnit: 28, buyCostPerUnit: 34, importCostPerUnit: 24, stockLeadDays: 0, buyLeadDays: 4, importLeadDays: 22 },
      { name: "חומר ליטוש מירור", unit: "ליטר", qtyNeeded: 8, stockAvailable: 12, stockCostPerUnit: 120, buyCostPerUnit: 135, importCostPerUnit: 105, stockLeadDays: 0, buyLeadDays: 3, importLeadDays: 18 },
    ],
  },
];

function recommend(m: Material): { source: Source; reason: string } {
  if (m.stockAvailable >= m.qtyNeeded && m.stockCostPerUnit <= m.buyCostPerUnit) {
    return { source: "מלאי", reason: "מלאי מספיק ועלות נמוכה מרכישה" };
  }
  if (m.stockAvailable >= m.qtyNeeded && m.stockCostPerUnit > m.buyCostPerUnit) {
    return { source: "רכישה", reason: "מלאי קיים אך מחיר רכישה נמוך יותר" };
  }
  if (m.stockAvailable === 0) {
    if (m.buyCostPerUnit <= m.importCostPerUnit) return { source: "רכישה", reason: "אין מלאי, רכישה מקומית זולה מיבוא" };
    if (m.importLeadDays <= 30) return { source: "יבוא", reason: "אין מלאי, יבוא זול יותר בזמן סביר" };
    return { source: "רכישה", reason: "אין מלאי, יבוא זול אך זמן אספקה ארוך" };
  }
  if (m.buyCostPerUnit <= m.importCostPerUnit) return { source: "רכישה", reason: "מלאי חלקי, רכישה משלימה עדיפה" };
  return { source: "רכישה", reason: "מלאי חלקי, השלמה ברכישה מקומית" };
}

const sourceBadge: Record<Source, string> = {
  "מלאי": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "רכישה": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "יבוא": "bg-purple-500/20 text-purple-400 border-purple-500/30",
};
const sourceIcon: Record<Source, typeof Warehouse> = { "מלאי": Warehouse, "רכישה": ShoppingCart, "יבוא": Ship };

export default function StockVsBuyDecision() {
  const [selectedProject, setSelectedProject] = useState(0);
  const proj = projects[selectedProject];

  const rows = useMemo(() => proj.materials.map((m) => {
    const { source, reason } = recommend(m);
    const allBuyCost = m.qtyNeeded * m.buyCostPerUnit;
    let actualCost: number;
    if (source === "מלאי") actualCost = m.qtyNeeded * m.stockCostPerUnit;
    else if (source === "יבוא") actualCost = m.qtyNeeded * m.importCostPerUnit;
    else actualCost = m.qtyNeeded * m.buyCostPerUnit;
    const savings = allBuyCost - actualCost;
    return { ...m, source, reason, actualCost, savings };
  }), [proj]);

  const summary = useMemo(() => {
    const fromStock = rows.filter(r => r.source === "מלאי").length;
    const toBuy = rows.filter(r => r.source === "רכישה").length;
    const toImport = rows.filter(r => r.source === "יבוא").length;
    const totalCost = rows.reduce((s, r) => s + r.actualCost, 0);
    const allBuyTotal = rows.reduce((s, r) => s + r.qtyNeeded * r.buyCostPerUnit, 0);
    const totalSavings = allBuyTotal - totalCost;
    return { fromStock, toBuy, toImport, totalCost, allBuyTotal, totalSavings };
  }, [rows]);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
          <Scale className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">מלאי מול רכישה — החלטת מיקור</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי | ניתוח מקור חומרים אופטימלי לפרויקט</p>
        </div>
      </div>

      {/* Project Selector */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Package className="w-5 h-5 text-violet-400" />
            <span className="text-sm text-muted-foreground">בחר פרויקט:</span>
            {projects.map((p, i) => (
              <button key={p.id} onClick={() => setSelectedProject(i)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                  selectedProject === i
                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                    : "bg-muted/20 border-border hover:bg-muted/40 text-muted-foreground"
                }`}>
                {p.id} — {p.name}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground mr-9">לקוח: {proj.client} | חומרים: {proj.materials.length} פריטים</div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "פריטים מהמלאי", value: summary.fromStock, icon: Warehouse, color: "text-emerald-400", bg: "from-emerald-500/10" },
          { label: "פריטים לרכישה", value: summary.toBuy, icon: ShoppingCart, color: "text-blue-400", bg: "from-blue-500/10" },
          { label: "פריטים ליבוא", value: summary.toImport, icon: Ship, color: "text-purple-400", bg: "from-purple-500/10" },
          { label: "עלות כוללת מומלצת", value: fmt(summary.totalCost), icon: DollarSign, color: "text-amber-400", bg: "from-amber-500/10" },
          { label: "חיסכון מול רכישה מלאה", value: fmt(summary.totalSavings), icon: TrendingDown, color: "text-green-400", bg: "from-green-500/10" },
        ].map((c, i) => (
          <Card key={i} className={`bg-gradient-to-br ${c.bg} to-transparent border-border/50`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Savings Bar */}
      <Card className="bg-card border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-indigo-400" />
              חיסכון מול תרחיש רכישה מלאה
            </span>
            <span className="text-sm font-bold text-green-400">
              {fmt(summary.totalSavings)} ({summary.allBuyTotal > 0 ? ((summary.totalSavings / summary.allBuyTotal) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <Progress value={summary.allBuyTotal > 0 ? ((summary.totalSavings / summary.allBuyTotal) * 100) * 5 : 0}
            className="h-3 [&>div]:bg-gradient-to-l [&>div]:from-green-500 [&>div]:to-emerald-600" />
        </CardContent>
      </Card>

      {/* Decision Table */}
      <Card className="bg-card border-border/50 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="w-4 h-4 text-indigo-400" />
            טבלת החלטות — {proj.id}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground text-xs bg-muted/10">
                  <th className="p-3 text-right font-medium">חומר</th>
                  <th className="p-3 text-right font-medium">כמות</th>
                  <th className="p-3 text-right font-medium">מלאי זמין</th>
                  <th className="p-3 text-right font-medium">עלות מלאי/יח'</th>
                  <th className="p-3 text-right font-medium">עלות רכישה/יח'</th>
                  <th className="p-3 text-right font-medium">עלות יבוא/יח'</th>
                  <th className="p-3 text-right font-medium">מקור מומלץ</th>
                  <th className="p-3 text-right font-medium">סיבה</th>
                  <th className="p-3 text-right font-medium">חיסכון</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const SrcIcon = sourceIcon[r.source];
                  const stockPct = r.qtyNeeded > 0 ? Math.min((r.stockAvailable / r.qtyNeeded) * 100, 100) : 0;
                  return (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3">{r.qtyNeeded} {r.unit}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={r.stockAvailable >= r.qtyNeeded ? "text-emerald-400" : r.stockAvailable > 0 ? "text-amber-400" : "text-red-400"}>
                            {r.stockAvailable}
                          </span>
                          <Progress value={stockPct} className={`h-1.5 w-12 ${
                            stockPct >= 100 ? "[&>div]:bg-emerald-500" : stockPct > 0 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"
                          }`} />
                        </div>
                      </td>
                      <td className="p-3">{fmt(r.stockCostPerUnit)}</td>
                      <td className="p-3">{fmt(r.buyCostPerUnit)}</td>
                      <td className="p-3">{fmt(r.importCostPerUnit)}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`${sourceBadge[r.source]} gap-1`}>
                          <SrcIcon className="w-3 h-3" />{r.source}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground max-w-[180px]">{r.reason}</td>
                      <td className="p-3">
                        {r.savings > 0 ? (
                          <span className="text-green-400 font-medium">{fmt(r.savings)}</span>
                        ) : r.savings === 0 ? (
                          <span className="text-muted-foreground">--</span>
                        ) : (
                          <span className="text-red-400 font-medium">{fmt(r.savings)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/10 border-t border-border font-semibold">
                  <td className="p-3" colSpan={6}>סה"כ</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">{summary.fromStock}</Badge>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">{summary.toBuy}</Badge>
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">{summary.toImport}</Badge>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">עלות כוללת: {fmt(summary.totalCost)}</td>
                  <td className="p-3 text-green-400">{fmt(summary.totalSavings)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Lead Time + Alerts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              זמני אספקה לפי מקור
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r, i) => {
              const ld = r.source === "מלאי" ? r.stockLeadDays : r.source === "רכישה" ? r.buyLeadDays : r.importLeadDays;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm w-40 truncate">{r.name}</span>
                  <div className="flex-1 h-3 bg-muted/20 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${ld === 0 ? "bg-emerald-500" : ld <= 7 ? "bg-blue-500" : ld <= 21 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min((ld / 45) * 100, 100)}%` }} />
                  </div>
                  <span className={`text-xs w-16 text-left font-medium ${ld === 0 ? "text-emerald-400" : ld <= 7 ? "text-blue-400" : ld <= 21 ? "text-amber-400" : "text-red-400"}`}>
                    {ld === 0 ? "מיידי" : `${ld} ימים`}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              התראות והמלצות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.filter(r => r.stockAvailable > 0 && r.stockAvailable < r.qtyNeeded).map((r, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-300">
                  <strong>{r.name}</strong> — מלאי חלקי ({r.stockAvailable} מתוך {r.qtyNeeded}). יש להשלים {r.qtyNeeded - r.stockAvailable} {r.unit} ברכישה.
                </div>
              </div>
            ))}
            {rows.filter(r => r.stockAvailable === 0).map((r, i) => (
              <div key={`e-${i}`} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <Package className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div className="text-xs text-red-300">
                  <strong>{r.name}</strong> — אין מלאי כלל. מומלץ {r.source} (זמן אספקה: {r.source === "יבוא" ? r.importLeadDays : r.buyLeadDays} ימים).
                </div>
              </div>
            ))}
            {rows.filter(r => r.source === "מלאי").length > 0 && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-xs text-emerald-300">
                  {rows.filter(r => r.source === "מלאי").length} פריטים זמינים מיידית מהמלאי — ללא המתנה.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
