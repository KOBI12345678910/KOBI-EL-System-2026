import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FlaskConical, TrendingUp, TrendingDown, RefreshCw, Ship,
  ShieldAlert, BarChart3, Layers, ArrowLeftRight, Package, Percent
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

// ---- affected materials catalog ----
const FALLBACK_MATERIALS = [
  { id: 1, name: "פרופיל אלומיניום 6063", unit: "מ'", cost: 148, qty: 2400, margin: 32, supplier: "אלומט בע\"מ" },
  { id: 2, name: "זכוכית מחוסמת 8 מ\"מ", unit: 'מ"ר', cost: 210, qty: 1800, margin: 28, supplier: "זכוכית ירושלים" },
  { id: 3, name: "חיבורי נירוסטה 316", unit: "יח'", cost: 34, qty: 12000, margin: 38, supplier: "MegaFix EU" },
  { id: 4, name: "אטם EPDM מותאם", unit: "מ'", cost: 12, qty: 8500, margin: 45, supplier: "רבר-טק" },
  { id: 5, name: "פח אלומיניום 1.2 מ\"מ", unit: 'מ"ר', cost: 95, qty: 3200, margin: 30, supplier: "אלומט בע\"מ" },
  { id: 6, name: "ברגים גלוון M8x40", unit: "יח'", cost: 1.8, qty: 45000, margin: 52, supplier: "MegaFix EU" },
];

const suppliers = ["אלומט בע\"מ", "זכוכית ירושלים", "MegaFix EU", "רבר-טק", "מתכת-פרו", "YieldSteel CN"];

// ---- saved scenarios ----
const FALLBACK_SAVED_SCENARIOS = [
  { id: 1, name: "עליית אלומיניום Q3", type: "price_increase", date: "2026-03-15", impact: 42800, status: "פעיל" },
  { id: 2, name: "החלפה ל-YieldSteel", type: "supplier_change", date: "2026-02-20", impact: -31500, status: "אושר" },
  { id: 3, name: "הנחת כמות נירוסטה", type: "bulk_discount", date: "2026-03-01", impact: -18200, status: "בבדיקה" },
  { id: 4, name: "מכסי יבוא חדשים", type: "import_cost_change", date: "2026-01-10", impact: 67300, status: "נדחה" },
  { id: 5, name: "הנחת נפח אטמים", type: "bulk_discount", date: "2026-03-28", impact: -9400, status: "פעיל" },
];

const typeLabel: Record<string, string> = {
  price_increase: "עליית מחיר", supplier_change: "החלפת ספק",
  bulk_discount: "הנחת כמות", import_cost_change: "שינוי עלות יבוא",
};
const typeBadge: Record<string, string> = {
  price_increase: "bg-red-600/20 text-red-300 border-red-600",
  supplier_change: "bg-blue-600/20 text-blue-300 border-blue-600",
  bulk_discount: "bg-emerald-600/20 text-emerald-300 border-emerald-600",
  import_cost_change: "bg-orange-600/20 text-orange-300 border-orange-600",
};
const statusBadge: Record<string, string> = {
  "פעיל": "bg-green-600/20 text-green-300 border-green-600",
  "אושר": "bg-blue-600/20 text-blue-300 border-blue-600",
  "בבדיקה": "bg-yellow-600/20 text-yellow-300 border-yellow-600",
  "נדחה": "bg-gray-600/20 text-gray-400 border-gray-600",
};

export default function ProcurementSimulation() {
  const { data: procurementsimulationData } = useQuery({
    queryKey: ["procurement-simulation"],
    queryFn: () => authFetch("/api/procurement/procurement_simulation"),
    staleTime: 5 * 60 * 1000,
  });

  const materials = procurementsimulationData ?? FALLBACK_MATERIALS;
  const savedScenarios = FALLBACK_SAVED_SCENARIOS;

  const [scenario, setScenario] = useState<string>("price_increase");
  const [priceChange, setPriceChange] = useState(15);
  const [selectedSupplier, setSelectedSupplier] = useState("מתכת-פרו");
  const [bulkQty, setBulkQty] = useState(150);
  const [importChange, setImportChange] = useState(20);
  const [compareIds, setCompareIds] = useState<number[]>([1, 2, 3]);

  const portfolioTotal = materials.reduce((s, m) => s + m.cost * m.qty, 0);

  // ---- simulation engine ----
  const simulate = (m: typeof materials[0]) => {
    let simCost = m.cost;
    let rec = "";
    if (scenario === "price_increase") {
      simCost = m.cost * (1 + priceChange / 100);
      rec = priceChange > 10 ? "חפש ספק חלופי" : "עקוב אחר מגמה";
    } else if (scenario === "supplier_change") {
      simCost = m.cost * 0.88;
      rec = "בדוק איכות ספק חדש";
    } else if (scenario === "bulk_discount") {
      const discountPct = Math.min(bulkQty / 10, 18);
      simCost = m.cost * (1 - discountPct / 100);
      rec = discountPct > 12 ? "הזמנה מרוכזת מומלצת" : "שקול איחוד הזמנות";
    } else {
      simCost = m.cost * (1 + importChange / 100 * 0.35);
      rec = importChange > 15 ? "העדף ספק מקומי" : "גידור מטבע";
    }
    const costImpact = (simCost - m.cost) * m.qty;
    const marginAfter = m.margin + ((m.cost - simCost) / m.cost) * m.margin;
    return { simCost, costImpact, marginBefore: m.margin, marginAfter, rec };
  };

  const totalImpact = materials.reduce((s, m) => s + simulate(m).costImpact, 0);
  const avgMarginBefore = materials.reduce((s, m) => s + m.margin, 0) / materials.length;
  const avgMarginAfter = materials.reduce((s, m) => s + simulate(m).marginAfter, 0) / materials.length;
  const riskLevel = Math.abs(totalImpact) > 50000 ? "גבוה" : Math.abs(totalImpact) > 20000 ? "בינוני" : "נמוך";
  const riskColor = riskLevel === "גבוה" ? "text-red-400" : riskLevel === "בינוני" ? "text-yellow-400" : "text-green-400";

  const scenarioCards = [
    { key: "price_increase", label: "עליית מחיר", icon: TrendingUp, color: "text-red-400", border: "border-red-600/30",
      current: "מחיר נוכחי", change: `+${priceChange}%`, desc: "עלייה צפויה במחירי חומרי גלם" },
    { key: "supplier_change", label: "החלפת ספק", icon: RefreshCw, color: "text-blue-400", border: "border-blue-600/30",
      current: "ספק נוכחי", change: selectedSupplier, desc: "מעבר לספק חדש עם תנאים שונים" },
    { key: "bulk_discount", label: "הנחת כמות", icon: Package, color: "text-emerald-400", border: "border-emerald-600/30",
      current: `כמות בסיס`, change: `${bulkQty}% מעל סף`, desc: "הגדלת כמות הזמנה להנחה" },
    { key: "import_cost_change", label: "שינוי עלות יבוא", icon: Ship, color: "text-orange-400", border: "border-orange-600/30",
      current: "עלות יבוא נוכחית", change: `+${importChange}%`, desc: "שינוי בעלויות הובלה ומכס" },
  ];

  const SC = "w-full bg-[#1a1d23] border border-gray-700 rounded px-3 py-2 text-white";

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0b0d] text-gray-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-purple-600/20">
          <FlaskConical className="h-7 w-7 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">סימולציית רכש &mdash; What If</h1>
          <p className="text-sm text-gray-400">טכנו-כל עוזי &mdash; ניתוח תרחישי רכש והשפעות עלויות</p>
        </div>
      </div>

      <Tabs defaultValue="simulation" className="space-y-4">
        <TabsList className="bg-[#1a1d23] border border-gray-800">
          <TabsTrigger value="simulation" className="data-[state=active]:bg-purple-600"><FlaskConical className="h-4 w-4 ml-1" />סימולציה</TabsTrigger>
          <TabsTrigger value="saved" className="data-[state=active]:bg-purple-600"><Layers className="h-4 w-4 ml-1" />תרחישים שמורים</TabsTrigger>
          <TabsTrigger value="compare" className="data-[state=active]:bg-purple-600"><ArrowLeftRight className="h-4 w-4 ml-1" />השוואה</TabsTrigger>
        </TabsList>

        {/* ====== TAB 1: Interactive Simulation ====== */}
        <TabsContent value="simulation" className="space-y-4">
          {/* Scenario selector + sliders */}
          <Card className="bg-[#12141a] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-gray-200">בחירת תרחיש ופרמטרים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">סוג תרחיש</label>
                  <select value={scenario} onChange={e => setScenario(e.target.value)} className={SC}>
                    <option value="price_increase">עליית מחיר ספק</option>
                    <option value="supplier_change">החלפת ספק</option>
                    <option value="bulk_discount">הנחת כמות (Bulk)</option>
                    <option value="import_cost_change">שינוי עלות יבוא</option>
                  </select>
                </div>
                {scenario === "price_increase" && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 flex justify-between"><span>שינוי מחיר %</span><span className="text-red-400 font-bold">+{priceChange}%</span></label>
                    <input type="range" min={1} max={50} value={priceChange} onChange={e => setPriceChange(Number(e.target.value))} className="w-full accent-red-500" />
                  </div>
                )}
                {scenario === "supplier_change" && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">ספק חדש</label>
                    <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} className={SC}>
                      {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {scenario === "bulk_discount" && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 flex justify-between"><span>כמות מעל סף הנחה %</span><span className="text-emerald-400 font-bold">{bulkQty}%</span></label>
                    <input type="range" min={10} max={300} value={bulkQty} onChange={e => setBulkQty(Number(e.target.value))} className="w-full accent-emerald-500" />
                  </div>
                )}
                {scenario === "import_cost_change" && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 flex justify-between"><span>שינוי עלות יבוא %</span><span className="text-orange-400 font-bold">+{importChange}%</span></label>
                    <input type="range" min={1} max={60} value={importChange} onChange={e => setImportChange(Number(e.target.value))} className="w-full accent-orange-500" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 4 Scenario cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {scenarioCards.map(sc => {
              const active = sc.key === scenario;
              const Icon = sc.icon;
              return (
                <Card key={sc.key} onClick={() => setScenario(sc.key)}
                  className={`bg-[#12141a] cursor-pointer transition-all ${active ? `${sc.border} border-2 ring-1 ring-${sc.color.replace("text-", "")}` : "border-gray-800 hover:border-gray-600"}`}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${sc.color}`} />
                      <span className="text-sm font-medium text-gray-200">{sc.label}</span>
                    </div>
                    <div className="text-xs text-gray-500">{sc.current}</div>
                    <div className={`text-lg font-bold ${sc.color}`}>{sc.change}</div>
                    <p className="text-xs text-gray-500">{sc.desc}</p>
                    {active && <Badge className="bg-purple-600/30 text-purple-300 border-purple-500 text-[10px]">פעיל</Badge>}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Results table */}
          <Card className="bg-[#12141a] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-gray-200 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-400" />תוצאות סימולציה &mdash; חומרים מושפעים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-gray-800">
                  {["חומר", "ספק", "עלות נוכחית", "עלות סימולציה", "הפרש ₪", "מרווח לפני", "מרווח אחרי", "המלצה"].map(h =>
                    <TableHead key={h} className="text-right text-gray-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {materials.map(m => {
                    const s = simulate(m);
                    return (
                      <TableRow key={m.id} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell className="font-medium text-white text-sm">{m.name}</TableCell>
                        <TableCell className="text-xs text-gray-400">{m.supplier}</TableCell>
                        <TableCell>{fmt(m.cost)}</TableCell>
                        <TableCell className={s.simCost > m.cost ? "text-red-400" : "text-emerald-400"}>{fmt(s.simCost)}</TableCell>
                        <TableCell className={s.costImpact > 0 ? "text-red-400" : "text-emerald-400"}>{s.costImpact > 0 ? "+" : ""}{fmt(s.costImpact)}</TableCell>
                        <TableCell className="text-gray-300">{m.margin}%</TableCell>
                        <TableCell className={s.marginAfter < m.margin ? "text-red-400" : "text-emerald-400"}>{s.marginAfter.toFixed(1)}%</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] border-gray-600 text-gray-300">{s.rec}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Summary strip */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-[#12141a] border-gray-800"><CardContent className="pt-5 text-center space-y-1">
              <p className="text-xs text-gray-400">השפעה כוללת על תיק</p>
              <p className={`text-2xl font-bold ${totalImpact > 0 ? "text-red-400" : "text-emerald-400"}`}>{totalImpact > 0 ? "+" : ""}{fmt(totalImpact)}</p>
              <p className="text-xs text-gray-500">{pct((totalImpact / portfolioTotal) * 100)} מסך התיק</p>
            </CardContent></Card>
            <Card className="bg-[#12141a] border-gray-800"><CardContent className="pt-5 text-center space-y-1">
              <p className="text-xs text-gray-400">מרווח ממוצע</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-bold text-gray-300">{avgMarginBefore.toFixed(1)}%</span>
                <span className="text-gray-500">&rarr;</span>
                <span className={`text-lg font-bold ${avgMarginAfter < avgMarginBefore ? "text-red-400" : "text-emerald-400"}`}>{avgMarginAfter.toFixed(1)}%</span>
              </div>
            </CardContent></Card>
            <Card className="bg-[#12141a] border-gray-800"><CardContent className="pt-5 text-center space-y-1">
              <p className="text-xs text-gray-400">הערכת סיכון</p>
              <div className="flex items-center justify-center gap-2">
                <ShieldAlert className={`h-5 w-5 ${riskColor}`} />
                <span className={`text-xl font-bold ${riskColor}`}>{riskLevel}</span>
              </div>
            </CardContent></Card>
            <Card className="bg-[#12141a] border-gray-800"><CardContent className="pt-5 text-center space-y-1">
              <p className="text-xs text-gray-400">סה"כ תיק רכש</p>
              <p className="text-2xl font-bold text-white">{fmt(portfolioTotal)}</p>
              <Progress value={Math.min(Math.abs(totalImpact / portfolioTotal) * 100, 100) * 5} className="h-2 mt-1" />
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* ====== TAB 2: Saved Scenarios ====== */}
        <TabsContent value="saved" className="space-y-4">
          <Card className="bg-[#12141a] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-gray-200 flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-400" />תרחישים שמורים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-gray-800">
                  {["שם תרחיש", "סוג", "תאריך", "השפעה ₪", "סטטוס"].map(h =>
                    <TableHead key={h} className="text-right text-gray-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {savedScenarios.map(s => (
                    <TableRow key={s.id} className="border-gray-800 hover:bg-gray-800/40">
                      <TableCell className="font-medium text-white">{s.name}</TableCell>
                      <TableCell><Badge variant="outline" className={typeBadge[s.type]}>{typeLabel[s.type]}</Badge></TableCell>
                      <TableCell className="text-gray-400 text-sm">{s.date}</TableCell>
                      <TableCell className={s.impact > 0 ? "text-red-400 font-medium" : "text-emerald-400 font-medium"}>
                        {s.impact > 0 ? "+" : ""}{fmt(s.impact)}
                      </TableCell>
                      <TableCell><Badge variant="outline" className={statusBadge[s.status] || ""}>{s.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(typeLabel).map(([k, v]) => {
              const count = savedScenarios.filter(s => s.type === k).length;
              const sum = savedScenarios.filter(s => s.type === k).reduce((a, s) => a + s.impact, 0);
              return (
                <Card key={k} className="bg-[#12141a] border-gray-800">
                  <CardContent className="pt-4 space-y-1">
                    <p className="text-xs text-gray-400">{v}</p>
                    <p className="text-lg font-bold text-white">{count} תרחישים</p>
                    <p className={`text-sm ${sum > 0 ? "text-red-400" : "text-emerald-400"}`}>{sum > 0 ? "+" : ""}{fmt(sum)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ====== TAB 3: Compare Scenarios ====== */}
        <TabsContent value="compare" className="space-y-4">
          <Card className="bg-[#12141a] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-gray-200 flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-purple-400" />השוואת תרחישים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[0, 1, 2].map(idx => (
                  <div key={idx}>
                    <label className="text-xs text-gray-400 mb-1 block">תרחיש {idx + 1}</label>
                    <select value={compareIds[idx]} onChange={e => {
                      const next = [...compareIds]; next[idx] = Number(e.target.value); setCompareIds(next);
                    }} className={SC}>
                      {savedScenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {compareIds.map((id, idx) => {
              const s = savedScenarios.find(x => x.id === id)!;
              const impactPct = (s.impact / portfolioTotal) * 100;
              return (
                <Card key={idx} className="bg-[#12141a] border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-white">{s.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">סוג</span>
                      <Badge variant="outline" className={typeBadge[s.type]}>{typeLabel[s.type]}</Badge>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">השפעה כספית</span>
                      <span className={`font-bold ${s.impact > 0 ? "text-red-400" : "text-emerald-400"}`}>{s.impact > 0 ? "+" : ""}{fmt(s.impact)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">% מתיק</span>
                      <span className="text-gray-300">{pct(impactPct)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">תאריך</span>
                      <span className="text-gray-300">{s.date}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">סטטוס</span>
                      <Badge variant="outline" className={statusBadge[s.status]}>{s.status}</Badge>
                    </div>
                    <Progress value={Math.min(Math.abs(impactPct) * 10, 100)} className="h-2" />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="bg-[#12141a] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-200">טבלת השוואה מרוכזת</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-gray-800">
                  {["מדד", ...compareIds.map((id, i) => savedScenarios.find(x => x.id === id)?.name || `תרחיש ${i + 1}`)].map(h =>
                    <TableHead key={h} className="text-right text-gray-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {[
                    { label: "השפעה כספית", vals: compareIds.map(id => { const s = savedScenarios.find(x => x.id === id)!; return { text: fmt(s.impact), cls: s.impact > 0 ? "text-red-400" : "text-emerald-400" }; }) },
                    { label: "% מתיק", vals: compareIds.map(id => { const s = savedScenarios.find(x => x.id === id)!; return { text: pct((s.impact / portfolioTotal) * 100), cls: "text-gray-300" }; }) },
                    { label: "סוג תרחיש", vals: compareIds.map(id => { const s = savedScenarios.find(x => x.id === id)!; return { text: typeLabel[s.type], cls: "text-gray-300" }; }) },
                    { label: "רמת סיכון", vals: compareIds.map(id => { const s = savedScenarios.find(x => x.id === id)!; const r = Math.abs(s.impact) > 50000 ? "גבוה" : Math.abs(s.impact) > 20000 ? "בינוני" : "נמוך"; return { text: r, cls: r === "גבוה" ? "text-red-400" : r === "בינוני" ? "text-yellow-400" : "text-green-400" }; }) },
                    { label: "סטטוס", vals: compareIds.map(id => { const s = savedScenarios.find(x => x.id === id)!; return { text: s.status, cls: "text-gray-300" }; }) },
                  ].map(row => (
                    <TableRow key={row.label} className="border-gray-800">
                      <TableCell className="font-medium text-gray-400">{row.label}</TableCell>
                      {row.vals.map((v, i) => <TableCell key={i} className={`font-medium ${v.cls}`}>{v.text}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
