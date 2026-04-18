import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Trash2, TrendingDown, TrendingUp, Recycle, DollarSign,
  BarChart3, Target, ArrowDownRight, ArrowUpRight, Percent,
} from "lucide-react";

// ============================================================
// SCRAP & WASTE DATA — טכנו-כל עוזי
// ============================================================

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");
const fmtKg = (n: number) => n.toLocaleString("he-IL") + " ק\"ג";

const FALLBACK_KPIS = [
  { label: "פסולת החודש", value: fmtKg(3_420), icon: Trash2, color: "text-red-400", bg: "bg-red-600/20 border-red-500/30" },
  { label: "שווי פסולת", value: fmt(48_750), icon: DollarSign, color: "text-amber-400", bg: "bg-amber-600/20 border-amber-500/30" },
  { label: "שחזור גרוטאות", value: fmt(18_200), icon: Recycle, color: "text-green-400", bg: "bg-green-600/20 border-green-500/30" },
  { label: "עלות נטו פסולת", value: fmt(30_550), icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-600/20 border-orange-500/30" },
  { label: "אחוז פסולת", value: "3.8%", icon: Percent, color: "text-purple-400", bg: "bg-purple-600/20 border-purple-500/30" },
  { label: "שיפור מול חודש קודם", value: "↓ 0.4%", icon: ArrowDownRight, color: "text-emerald-400", bg: "bg-emerald-600/20 border-emerald-500/30" },
];

// Tab 1 — Waste by Material
interface WasteByMaterial {
  material: string;
  qtyProduced: number;
  wasteKg: number;
  wastePct: number;
  recoveryValue: number;
  netCost: number;
}

const FALLBACK_WASTE_BY_MATERIAL: WasteByMaterial[] = [
  { material: "פרופיל ברזל 40x40", qtyProduced: 12_400, wasteKg: 620, wastePct: 5.0, recoveryValue: 3_100, netCost: 5_580 },
  { material: "פרופיל אלומיניום תרמי", qtyProduced: 8_600, wasteKg: 344, wastePct: 4.0, recoveryValue: 4_816, netCost: 3_024 },
  { material: "נירוסטה 304 פס 30x3", qtyProduced: 4_200, wasteKg: 168, wastePct: 4.0, recoveryValue: 2_520, netCost: 2_280 },
  { material: "זכוכית מחוסמת 10מ\"מ", qtyProduced: 15_800, wasteKg: 790, wastePct: 5.0, recoveryValue: 0, netCost: 9_480 },
  { material: "פח מגולוון 1.5מ\"מ", qtyProduced: 6_300, wasteKg: 252, wastePct: 4.0, recoveryValue: 1_260, netCost: 2_268 },
  { material: "פרופיל ברזל 60x30", qtyProduced: 9_800, wasteKg: 392, wastePct: 4.0, recoveryValue: 1_960, netCost: 3_528 },
  { material: "צינור נירוסטה 42מ\"מ", qtyProduced: 3_100, wasteKg: 124, wastePct: 4.0, recoveryValue: 1_860, netCost: 1_116 },
  { material: "אלומיניום יצוק A356", qtyProduced: 5_400, wasteKg: 270, wastePct: 5.0, recoveryValue: 2_700, netCost: 3_240 },
];

// Tab 2 — Scrap Inventory
interface ScrapItem {
  type: string;
  qtyKg: number;
  valuePerKg: number;
  totalValue: number;
  buyer: string;
}

const FALLBACK_SCRAP_INVENTORY: ScrapItem[] = [
  { type: "ברזל", qtyKg: 2_840, valuePerKg: 2.5, totalValue: 7_100, buyer: "מתכות השרון בע\"מ" },
  { type: "אלומיניום", qtyKg: 1_260, valuePerKg: 7.0, totalValue: 8_820, buyer: "רימון מיחזור" },
  { type: "נירוסטה", qtyKg: 680, valuePerKg: 12.0, totalValue: 8_160, buyer: "Stainless Recyclers Ltd" },
  { type: "ברזל (גלוון)", qtyKg: 940, valuePerKg: 2.0, totalValue: 1_880, buyer: "מתכות השרון בע\"מ" },
  { type: "אלומיניום (שבבים)", qtyKg: 420, valuePerKg: 5.0, totalValue: 2_100, buyer: "רימון מיחזור" },
  { type: "נירוסטה (חיתוכים)", qtyKg: 310, valuePerKg: 10.0, totalValue: 3_100, buyer: "Stainless Recyclers Ltd" },
  { type: "זכוכית שבורה", qtyKg: 1_150, valuePerKg: 0.3, totalValue: 345, buyer: "זכוכית ירוקה מיחזור" },
  { type: "פליז ונחושת", qtyKg: 180, valuePerKg: 22.0, totalValue: 3_960, buyer: "מתכות יקרות ר\"ג" },
];

// Tab 3 — Monthly Trends
interface MonthlyTrend {
  month: string;
  totalWasteKg: number;
  wasteValue: number;
  recoveryValue: number;
  netCost: number;
  wastePct: number;
}

const FALLBACK_MONTHLY_TRENDS: MonthlyTrend[] = [
  { month: "נובמבר 2025", totalWasteKg: 4_100, wasteValue: 58_200, recoveryValue: 14_800, netCost: 43_400, wastePct: 4.6 },
  { month: "דצמבר 2025", totalWasteKg: 3_850, wasteValue: 54_600, recoveryValue: 15_200, netCost: 39_400, wastePct: 4.3 },
  { month: "ינואר 2026", totalWasteKg: 3_780, wasteValue: 53_100, recoveryValue: 16_500, netCost: 36_600, wastePct: 4.2 },
  { month: "פברואר 2026", totalWasteKg: 3_600, wasteValue: 51_200, recoveryValue: 17_000, netCost: 34_200, wastePct: 4.2 },
  { month: "מרץ 2026", totalWasteKg: 3_520, wasteValue: 49_800, recoveryValue: 17_600, netCost: 32_200, wastePct: 4.0 },
  { month: "אפריל 2026", totalWasteKg: 3_420, wasteValue: 48_750, recoveryValue: 18_200, netCost: 30_550, wastePct: 3.8 },
];

// Tab 4 — Waste Reduction Opportunities
interface Opportunity {
  material: string;
  currentPct: number;
  targetPct: number;
  savingsPotential: number;
  action: string;
  priority: "גבוהה" | "בינונית" | "נמוכה";
}

const FALLBACK_OPPORTUNITIES: Opportunity[] = [
  { material: "זכוכית מחוסמת 10מ\"מ", currentPct: 5.0, targetPct: 3.0, savingsPotential: 37_920, action: "שדרוג CNC חיתוך + אופטימיזציית nesting", priority: "גבוהה" },
  { material: "פרופיל ברזל 40x40", currentPct: 5.0, targetPct: 3.5, savingsPotential: 16_740, action: "תוכנת ניתוב חיתוך אוטומטית", priority: "גבוהה" },
  { material: "אלומיניום יצוק A356", currentPct: 5.0, targetPct: 3.0, savingsPotential: 12_960, action: "שיפור תבניות יציקה", priority: "בינונית" },
  { material: "פח מגולוון 1.5מ\"מ", currentPct: 4.0, targetPct: 2.5, savingsPotential: 9_450, action: "רכש גיליונות בגדלים מותאמים", priority: "בינונית" },
  { material: "פרופיל ברזל 60x30", currentPct: 4.0, targetPct: 2.5, savingsPotential: 13_230, action: "הזמנת אורכים מותאמים מספק", priority: "גבוהה" },
  { material: "צינור נירוסטה 42מ\"מ", currentPct: 4.0, targetPct: 2.0, savingsPotential: 5_580, action: "ריכוז חיתוך לסדרות ארוכות", priority: "נמוכה" },
  { material: "פרופיל אלומיניום תרמי", currentPct: 4.0, targetPct: 2.5, savingsPotential: 10_750, action: "אופטימיזציית אורכי חיתוך", priority: "בינונית" },
  { material: "נירוסטה 304 פס 30x3", currentPct: 4.0, targetPct: 2.5, savingsPotential: 5_700, action: "שימוש בשאריות לייצור חלקים קטנים", priority: "נמוכה" },
];

const priorityColor = (p: Opportunity["priority"]) => {
  if (p === "גבוהה") return "bg-red-600/20 text-red-400 border-red-600/30";
  if (p === "בינונית") return "bg-amber-600/20 text-amber-400 border-amber-600/30";
  return "bg-slate-600/20 text-slate-300 border-slate-500/30";
};

// ============================================================
// COMPONENT
// ============================================================

export default function ScrapWaste() {
  const { data: scrapwasteData } = useQuery({
    queryKey: ["scrap-waste"],
    queryFn: () => authFetch("/api/procurement/scrap_waste"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = scrapwasteData ?? FALLBACK_KPIS;
  const monthlyTrends = FALLBACK_MONTHLY_TRENDS;
  const opportunities = FALLBACK_OPPORTUNITIES;
  const scrapInventory = FALLBACK_SCRAP_INVENTORY;
  const wasteByMaterial = FALLBACK_WASTE_BY_MATERIAL;

  const [tab, setTab] = useState("by-material");

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 space-y-6">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-red-600/20 border border-red-500/30">
          <Trash2 className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">מעקב פסולת וגרוטאות</h1>
          <p className="text-sm text-slate-400">טכנו-כל עוזי · ניהול פסולת ושחזור חומרים</p>
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex flex-col items-center text-center gap-1">
              <div className={`p-1.5 rounded-md border ${k.bg}`}>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <span className="text-lg font-bold text-white">{k.value}</span>
              <span className="text-[11px] text-slate-400 leading-tight">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="by-material" className="data-[state=active]:bg-slate-700 text-slate-300 data-[state=active]:text-white">פסולת לפי חומר</TabsTrigger>
          <TabsTrigger value="scrap" className="data-[state=active]:bg-slate-700 text-slate-300 data-[state=active]:text-white">גרוטאות</TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-slate-700 text-slate-300 data-[state=active]:text-white">מגמות</TabsTrigger>
          <TabsTrigger value="opportunities" className="data-[state=active]:bg-slate-700 text-slate-300 data-[state=active]:text-white">הזדמנויות</TabsTrigger>
        </TabsList>

        {/* — Tab 1: Waste by Material — */}
        <TabsContent value="by-material">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-red-400" /> פסולת לפי חומר גלם — אפריל 2026
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-300 text-right">חומר</TableHead>
                    <TableHead className="text-slate-300 text-right">ייצור (ק"ג)</TableHead>
                    <TableHead className="text-slate-300 text-right">פסולת (ק"ג)</TableHead>
                    <TableHead className="text-slate-300 text-right">% פסולת</TableHead>
                    <TableHead className="text-slate-300 text-right">שחזור ₪</TableHead>
                    <TableHead className="text-slate-300 text-right">עלות נטו ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wasteByMaterial.map((r) => (
                    <TableRow key={r.material} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-white font-medium">{r.material}</TableCell>
                      <TableCell className="text-slate-300">{fmtKg(r.qtyProduced)}</TableCell>
                      <TableCell className="text-red-400 font-medium">{fmtKg(r.wasteKg)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.wastePct * 10} className="h-1.5 w-16 bg-slate-700" />
                          <span className={r.wastePct >= 5 ? "text-red-400" : "text-amber-400"}>{r.wastePct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-green-400">{r.recoveryValue > 0 ? fmt(r.recoveryValue) : "—"}</TableCell>
                      <TableCell className="text-orange-400 font-medium">{fmt(r.netCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* — Tab 2: Scrap Inventory — */}
        <TabsContent value="scrap">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Recycle className="h-5 w-5 text-green-400" /> מלאי גרוטאות — ממתין לפינוי/מכירה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-300 text-right">סוג</TableHead>
                    <TableHead className="text-slate-300 text-right">כמות (ק"ג)</TableHead>
                    <TableHead className="text-slate-300 text-right">₪ / ק"ג</TableHead>
                    <TableHead className="text-slate-300 text-right">שווי כולל ₪</TableHead>
                    <TableHead className="text-slate-300 text-right">קונה / יעד</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scrapInventory.map((s) => (
                    <TableRow key={s.type} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-white font-medium">{s.type}</TableCell>
                      <TableCell className="text-slate-300">{fmtKg(s.qtyKg)}</TableCell>
                      <TableCell className="text-cyan-400">{fmt(s.valuePerKg)}</TableCell>
                      <TableCell className="text-green-400 font-medium">{fmt(s.totalValue)}</TableCell>
                      <TableCell className="text-slate-300">{s.buyer}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex justify-between items-center px-2">
                <span className="text-sm text-slate-400">סה"כ מלאי גרוטאות</span>
                <div className="flex gap-6">
                  <span className="text-sm text-slate-300">{fmtKg(scrapInventory.reduce((a, s) => a + s.qtyKg, 0))}</span>
                  <span className="text-sm text-green-400 font-bold">{fmt(scrapInventory.reduce((a, s) => a + s.totalValue, 0))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* — Tab 3: Monthly Trends — */}
        <TabsContent value="trends">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-emerald-400" /> מגמות פסולת — 6 חודשים אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-300 text-right">חודש</TableHead>
                    <TableHead className="text-slate-300 text-right">פסולת (ק"ג)</TableHead>
                    <TableHead className="text-slate-300 text-right">שווי פסולת ₪</TableHead>
                    <TableHead className="text-slate-300 text-right">שחזור ₪</TableHead>
                    <TableHead className="text-slate-300 text-right">עלות נטו ₪</TableHead>
                    <TableHead className="text-slate-300 text-right">% פסולת</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTrends.map((m, i) => {
                    const prev = i > 0 ? monthlyTrends[i - 1].wastePct : m.wastePct;
                    const improving = m.wastePct <= prev;
                    return (
                      <TableRow key={m.month} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="text-white font-medium">{m.month}</TableCell>
                        <TableCell className="text-slate-300">{fmtKg(m.totalWasteKg)}</TableCell>
                        <TableCell className="text-red-400">{fmt(m.wasteValue)}</TableCell>
                        <TableCell className="text-green-400">{fmt(m.recoveryValue)}</TableCell>
                        <TableCell className="text-orange-400 font-medium">{fmt(m.netCost)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {improving ? (
                              <ArrowDownRight className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />
                            )}
                            <span className={improving ? "text-emerald-400" : "text-red-400"}>{m.wastePct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* — Tab 4: Waste Reduction Opportunities — */}
        <TabsContent value="opportunities">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-400" /> הזדמנויות לצמצום פסולת
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-300 text-right">חומר</TableHead>
                    <TableHead className="text-slate-300 text-right">% נוכחי</TableHead>
                    <TableHead className="text-slate-300 text-right">% יעד</TableHead>
                    <TableHead className="text-slate-300 text-right">חיסכון פוטנציאלי ₪</TableHead>
                    <TableHead className="text-slate-300 text-right">פעולה נדרשת</TableHead>
                    <TableHead className="text-slate-300 text-right">עדיפות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((o) => (
                    <TableRow key={o.material} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-white font-medium">{o.material}</TableCell>
                      <TableCell className="text-red-400">{o.currentPct}%</TableCell>
                      <TableCell className="text-emerald-400">{o.targetPct}%</TableCell>
                      <TableCell className="text-cyan-400 font-bold">{fmt(o.savingsPotential)}</TableCell>
                      <TableCell className="text-slate-300 text-sm max-w-[240px]">{o.action}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={priorityColor(o.priority)}>{o.priority}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex justify-between items-center px-2">
                <span className="text-sm text-slate-400">סה"כ חיסכון שנתי פוטנציאלי</span>
                <span className="text-sm text-cyan-400 font-bold">{fmt(opportunities.reduce((a, o) => a + o.savingsPotential, 0) * 12)}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}