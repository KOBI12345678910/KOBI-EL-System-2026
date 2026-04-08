import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Scale, Factory, ShoppingCart, TrendingUp, TrendingDown, ArrowRight,
  Calculator, BarChart3, FlaskConical, Package, Truck, DollarSign, Percent
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

// ---- static product catalog for comparison tab ----
const catalogProducts = [
  { id: 1, name: "פרופיל אלומיניום 6060", make: { material: 1200, labor: 800, overhead: 350, machine: 600 }, buy: { price: 3400, shipping: 180, import: 220 } },
  { id: 2, name: "זכוכית מחוסמת 10 מ\"מ", make: { material: 2800, labor: 1100, overhead: 500, machine: 900 }, buy: { price: 4800, shipping: 350, import: 400 } },
  { id: 3, name: "חיבורי נירוסטה", make: { material: 400, labor: 600, overhead: 200, machine: 350 }, buy: { price: 1200, shipping: 80, import: 60 } },
  { id: 4, name: "אטם EPDM מותאם", make: { material: 150, labor: 300, overhead: 100, machine: 200 }, buy: { price: 950, shipping: 50, import: 40 } },
  { id: 5, name: "ידית אלומיניום CNC", make: { material: 350, labor: 900, overhead: 250, machine: 700 }, buy: { price: 1800, shipping: 120, import: 150 } },
];

const scenarios = [
  { id: 1, name: "עליית מחיר ספק +10%", field: "supplierUp", delta: 0.10, icon: TrendingUp, color: "text-red-400" },
  { id: 2, name: "החלפת ספק (זול ב-15%)", field: "supplierDown", delta: -0.15, icon: TrendingDown, color: "text-green-400" },
  { id: 3, name: "הנחת כמות (bulk -12%)", field: "bulkDiscount", delta: -0.12, icon: Package, color: "text-blue-400" },
  { id: 4, name: "עליית עלויות יבוא +20%", field: "importUp", delta: 0.20, icon: Truck, color: "text-orange-400" },
];

export default function MakeVsBuy() {
  // --- calculator state ---
  const [selectedProduct, setSelectedProduct] = useState("פרופיל אלומיניום 6060");
  const [material, setMaterial] = useState(1200);
  const [labor, setLabor] = useState(800);
  const [overhead, setOverhead] = useState(350);
  const [machine, setMachine] = useState(600);
  const [supplierPrice, setSupplierPrice] = useState(3400);
  const [shipping, setShipping] = useState(180);
  const [importCost, setImportCost] = useState(220);

  const makeTotal = material + labor + overhead + machine;
  const buyTotal = supplierPrice + shipping + importCost;
  const savings = Math.abs(makeTotal - buyTotal);
  const recommendation: "make" | "buy" = makeTotal <= buyTotal ? "make" : "buy";
  const savingsPct = buyTotal > 0 ? ((buyTotal - makeTotal) / buyTotal) * 100 : 0;

  const loadProduct = (name: string) => {
    const p = catalogProducts.find(c => c.name === name);
    if (!p) return;
    setSelectedProduct(name);
    setMaterial(p.make.material);
    setLabor(p.make.labor);
    setOverhead(p.make.overhead);
    setMachine(p.make.machine);
    setSupplierPrice(p.buy.price);
    setShipping(p.buy.shipping);
    setImportCost(p.buy.import);
  };

  const simBuyCalc = (sc: typeof scenarios[0]) => {
    if (sc.field === "importUp") return supplierPrice + shipping + importCost * (1 + sc.delta);
    return supplierPrice * (1 + sc.delta) + shipping + importCost;
  };

  const IC = "w-full bg-[#1a1d23] border border-gray-700 rounded px-3 py-2 text-white text-left direction-ltr";
  const recBadge = (r: string) => r === "make" ? "bg-orange-600/30 text-orange-300 border-orange-600" : "bg-blue-600/30 text-blue-300 border-blue-600";
  const recLabel = (r: string) => r === "make" ? "ייצור עצמי" : "רכישה";

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0b0d] text-gray-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-indigo-600/20">
          <Scale className="h-7 w-7 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">מחשבון ייצור עצמי מול רכישה</h1>
          <p className="text-sm text-gray-400">טכנו-כל עוזי - ניתוח עלויות Make vs Buy</p>
        </div>
      </div>

      <Tabs defaultValue="calculator" className="space-y-4">
        <TabsList className="bg-[#1a1d23] border border-gray-800">
          <TabsTrigger value="calculator" className="data-[state=active]:bg-indigo-600"><Calculator className="h-4 w-4 ml-1" />מחשבון</TabsTrigger>
          <TabsTrigger value="comparison" className="data-[state=active]:bg-indigo-600"><BarChart3 className="h-4 w-4 ml-1" />השוואת מוצרים</TabsTrigger>
          <TabsTrigger value="simulation" className="data-[state=active]:bg-indigo-600"><FlaskConical className="h-4 w-4 ml-1" />סימולציה</TabsTrigger>
        </TabsList>

        {/* ====== TAB 1: Calculator ====== */}
        <TabsContent value="calculator" className="space-y-4">
          {/* Product selector */}
          <Card className="bg-[#12141a] border-gray-800">
            <CardContent className="pt-4">
              <label className="block text-sm text-gray-400 mb-2">בחירת מוצר / פריט</label>
              <select
                value={selectedProduct}
                onChange={e => loadProduct(e.target.value)}
                className="w-full bg-[#1a1d23] border border-gray-700 rounded px-3 py-2 text-white"
              >
                {catalogProducts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Make costs */}
            <Card className="bg-[#12141a] border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-orange-400">
                  <Factory className="h-5 w-5" />עלויות ייצור עצמי
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "חומרי גלם", value: material, set: setMaterial, icon: <Package className="h-4 w-4 text-gray-500" /> },
                  { label: "עבודה", value: labor, set: setLabor, icon: <DollarSign className="h-4 w-4 text-gray-500" /> },
                  { label: "תקורה", value: overhead, set: setOverhead, icon: <Percent className="h-4 w-4 text-gray-500" /> },
                  { label: "מכונות", value: machine, set: setMachine, icon: <Factory className="h-4 w-4 text-gray-500" /> },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">{f.icon}{f.label}</label>
                    <input type="number" value={f.value} onChange={e => f.set(Number(e.target.value))} className={IC} />
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-700 flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-300">סה"כ ייצור</span>
                  <span className="text-lg font-bold text-orange-400">{fmt(makeTotal)}</span>
                </div>
              </CardContent>
            </Card>
            {/* Buy costs */}
            <Card className="bg-[#12141a] border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-blue-400">
                  <ShoppingCart className="h-5 w-5" />עלויות רכישה
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "מחיר ספק", value: supplierPrice, set: setSupplierPrice, icon: <DollarSign className="h-4 w-4 text-gray-500" /> },
                  { label: "משלוח", value: shipping, set: setShipping, icon: <Truck className="h-4 w-4 text-gray-500" /> },
                  { label: "יבוא / מכס", value: importCost, set: setImportCost, icon: <Package className="h-4 w-4 text-gray-500" /> },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">{f.icon}{f.label}</label>
                    <input type="number" value={f.value} onChange={e => f.set(Number(e.target.value))} className={IC} />
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-700 flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-300">סה"כ רכישה</span>
                  <span className="text-lg font-bold text-blue-400">{fmt(buyTotal)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-[#12141a] border-gray-800"><CardContent className="pt-5 text-center space-y-1">
              <p className="text-xs text-gray-400">חיסכון</p>
              <p className="text-2xl font-bold text-emerald-400">{fmt(savings)}</p>
              <p className="text-xs text-gray-500">{pct(savingsPct)} {recommendation === "make" ? "בייצור עצמי" : "ברכישה"}</p>
            </CardContent></Card>
            <Card className="bg-[#12141a] border-gray-800"><CardContent className="pt-5 text-center space-y-1">
              <p className="text-xs text-gray-400">ייצור vs רכישה</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-bold text-orange-400">{fmt(makeTotal)}</span>
                <ArrowRight className="h-4 w-4 text-gray-500" />
                <span className="text-lg font-bold text-blue-400">{fmt(buyTotal)}</span>
              </div>
            </CardContent></Card>
            <Card className="bg-[#12141a] border-gray-800"><CardContent className="pt-5 text-center space-y-2">
              <p className="text-xs text-gray-400">המלצה</p>
              <Badge className={`text-sm px-4 py-1 ${recBadge(recommendation)}`}>{recLabel(recommendation)}</Badge>
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* ====== TAB 2: Product Comparison ====== */}
        <TabsContent value="comparison" className="space-y-4">
          <Card className="bg-[#12141a] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-gray-200">השוואת 5 מוצרים - ייצור עצמי מול רכישה</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-gray-800">
                  {["מוצר","עלות ייצור","עלות רכישה","הפרש","חיסכון %","המלצה"].map(h => <TableHead key={h} className="text-right text-gray-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {catalogProducts.map(p => {
                    const mk = p.make.material + p.make.labor + p.make.overhead + p.make.machine;
                    const by = p.buy.price + p.buy.shipping + p.buy.import;
                    const diff = by - mk;
                    const svPct = (diff / by) * 100;
                    const rec = mk <= by ? "make" : "buy";
                    return (
                      <TableRow key={p.id} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell className="font-medium text-white">{p.name}</TableCell>
                        <TableCell className="text-orange-400">{fmt(mk)}</TableCell>
                        <TableCell className="text-blue-400">{fmt(by)}</TableCell>
                        <TableCell className={diff > 0 ? "text-emerald-400" : "text-red-400"}>{fmt(Math.abs(diff))}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(Math.abs(svPct), 100)} className="h-2 w-16" />
                            <span className="text-xs text-gray-300">{svPct.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge className={recBadge(rec)}>{recLabel(rec)}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Side by side breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { title: "פירוט עלויות ייצור", icon: <Factory className="h-4 w-4" />, color: "text-orange-400",
                cols: ["מוצר","חומר","עבודה","תקורה","מכונות"],
                rows: catalogProducts.map(p => [p.name, fmt(p.make.material), fmt(p.make.labor), fmt(p.make.overhead), fmt(p.make.machine)]) },
              { title: "פירוט עלויות רכישה", icon: <ShoppingCart className="h-4 w-4" />, color: "text-blue-400",
                cols: ["מוצר","מחיר ספק","משלוח","יבוא"],
                rows: catalogProducts.map(p => [p.name, fmt(p.buy.price), fmt(p.buy.shipping), fmt(p.buy.import)]) },
            ] as const).map((t, ti) => (
              <Card key={ti} className="bg-[#12141a] border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className={`text-sm ${t.color} flex items-center gap-2`}>{t.icon}{t.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow className="border-gray-800">
                      {t.cols.map(c => <TableHead key={c} className="text-right text-gray-400">{c}</TableHead>)}
                    </TableRow></TableHeader>
                    <TableBody>
                      {t.rows.map((r, ri) => (
                        <TableRow key={ri} className="border-gray-800">
                          {r.map((cell, ci) => <TableCell key={ci} className={ci === 0 ? "text-white text-xs" : "text-xs"}>{cell}</TableCell>)}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ====== TAB 3: Simulation ====== */}
        <TabsContent value="simulation" className="space-y-4">
          <Card className="bg-[#12141a] border-gray-800">
            <CardHeader className="pb-2"><CardTitle className="text-base text-gray-200 flex items-center gap-2"><FlaskConical className="h-5 w-5 text-purple-400" />סימולציית תרחישים - What If</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400 mb-4">מבוסס על הנתונים הנוכחיים: ייצור {fmt(makeTotal)} | רכישה {fmt(buyTotal)}</p>
              <Table>
                <TableHeader><TableRow className="border-gray-800">
                  {["תרחיש","עלות ייצור","עלות רכישה","השפעה על עלות","השפעה על מרווח","המלצה"].map(h => <TableHead key={h} className="text-right text-gray-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {scenarios.map(sc => {
                    const simBuy = simBuyCalc(sc);
                    const costImpact = simBuy - buyTotal;
                    const marginImpact = simBuy > 0 ? ((simBuy - makeTotal) / simBuy) * 100 - ((buyTotal - makeTotal) / buyTotal) * 100 : 0;
                    const simRec = makeTotal <= simBuy ? "make" : "buy";
                    const Icon = sc.icon;
                    return (
                      <TableRow key={sc.id} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell className="font-medium text-white flex items-center gap-2"><Icon className={`h-4 w-4 ${sc.color}`} />{sc.name}</TableCell>
                        <TableCell className="text-orange-400">{fmt(makeTotal)}</TableCell>
                        <TableCell className="text-blue-400">{fmt(simBuy)}</TableCell>
                        <TableCell className={costImpact > 0 ? "text-red-400" : "text-emerald-400"}>{costImpact > 0 ? "+" : ""}{fmt(costImpact)}</TableCell>
                        <TableCell className={marginImpact > 0 ? "text-emerald-400" : "text-red-400"}>{pct(marginImpact)}</TableCell>
                        <TableCell><Badge className={recBadge(simRec)}>{recLabel(simRec)}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {scenarios.map(sc => {
              const simBuy = simBuyCalc(sc); const diff = simBuy - buyTotal;
              const Icon = sc.icon; const simRec = makeTotal <= simBuy ? "make" : "buy";
              return (
                <Card key={sc.id} className="bg-[#12141a] border-gray-800">
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center gap-2"><Icon className={`h-5 w-5 ${sc.color}`} /><span className="text-xs text-gray-300 font-medium">{sc.name}</span></div>
                    <p className={`text-xl font-bold ${diff > 0 ? "text-red-400" : "text-emerald-400"}`}>{diff > 0 ? "+" : ""}{fmt(diff)}</p>
                    <Badge variant="outline" className={simRec === "make" ? "border-orange-600 text-orange-300" : "border-blue-600 text-blue-300"}>{recLabel(simRec)}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="bg-[#12141a] border-gray-800">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-200">ניתוח נקודת איזון</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "מחיר ספק שבו ייצור עצמי משתלם", val: fmt(makeTotal - shipping - importCost), cls: "text-emerald-400" },
                { label: "עליית יבוא שתהפוך רכישה ליקרה", val: buyTotal > makeTotal ? fmt(makeTotal - supplierPrice - shipping) : "כבר יקרה יותר", cls: "text-orange-400" },
                { label: "הפרש נוכחי לנקודת מעבר", val: fmt(savings), cls: "text-white" },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{r.label}</span>
                  <span className={`text-sm font-bold ${r.cls}`}>{r.val}</span>
                </div>
              ))}
              <Progress value={Math.min((makeTotal / buyTotal) * 100, 100)} className="h-3" />
              <div className="flex justify-between text-xs text-gray-500">
                <span>ייצור: {((makeTotal / buyTotal) * 100).toFixed(0)}% מעלות הרכישה</span><span>רכישה: 100%</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}