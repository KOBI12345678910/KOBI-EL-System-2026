import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Calculator, Package, Users, Zap, TrendingUp,
  Truck, Trash2, DollarSign, BarChart3, ArrowUpDown, SlidersHorizontal
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");
const pct = (v: number) => v.toFixed(1) + "%";

const mkCosts = (m: number, l: number, o: number, t: number, w: number) => [
  { name: "חומרי גלם (מ-BOM)", amount: m, icon: Package, color: "text-blue-400" },
  { name: "עבודה (ריתוך, הרכבה, צביעה)", amount: l, icon: Users, color: "text-purple-400" },
  { name: "תקורות (חשמל, שכירות, ביטוח)", amount: o, icon: Zap, color: "text-yellow-400" },
  { name: "הובלה והתקנה", amount: t, icon: Truck, color: "text-emerald-400" },
  { name: "פסולת ואובדן", amount: w, icon: Trash2, color: "text-red-400" },
];

const FALLBACK_PRODUCTS = [
  { id: 1, name: "שער כניסה דגם Premium", salePrice: 7500, costs: mkCosts(2450, 1200, 380, 450, 180) },
  { id: 2, name: "שער חניה אוטומטי", salePrice: 12000, costs: mkCosts(4200, 2100, 680, 750, 320) },
  { id: 3, name: 'גדר אלומיניום 1 מ"א', salePrice: 850, costs: mkCosts(280, 140, 45, 65, 20) },
  { id: 4, name: "פרגולה מעוצבת 3x4", salePrice: 9200, costs: mkCosts(3100, 1600, 520, 600, 230) },
  { id: 5, name: "מעקה בטיחות נירוסטה", salePrice: 3200, costs: mkCosts(1050, 520, 170, 200, 80) },
];

const FALLBACK_TREND_DATA = [
  { month: "אוק׳ 25", materials: 2300, labor: 1100, overhead: 350 },
  { month: "נוב׳ 25", materials: 2350, labor: 1150, overhead: 360 },
  { month: "דצמ׳ 25", materials: 2400, labor: 1180, overhead: 370 },
  { month: "ינו׳ 26", materials: 2420, labor: 1190, overhead: 375 },
  { month: "פבר׳ 26", materials: 2440, labor: 1200, overhead: 378 },
  { month: "מרץ 26", materials: 2450, labor: 1200, overhead: 380 },
];


const PRODUCTS = FALLBACK_PRODUCTS;

function calcProduct(p: (typeof PRODUCTS)[0]) {
  const totalCost = p.costs.reduce((s, c) => s + c.amount, 0);
  const grossProfit = p.salePrice - totalCost;
  const grossMargin = (grossProfit / p.salePrice) * 100;
  const netMargin = grossMargin - 5.2;
  return { totalCost, grossProfit, grossMargin, netMargin };
}

export default function ProductCosting() {
  const { data: productcostingData } = useQuery({
    queryKey: ["product-costing"],
    queryFn: () => authFetch("/api/procurement/product_costing"),
    staleTime: 5 * 60 * 1000,
  });

  const PRODUCTS = productcostingData ?? FALLBACK_PRODUCTS;
  const TREND_DATA = FALLBACK_TREND_DATA;

  const [selectedId, setSelectedId] = useState(1);
  const [activeTab, setActiveTab] = useState("breakdown");
  const [simMat, setSimMat] = useState(0);
  const [simLab, setSimLab] = useState(0);
  const [simPrice, setSimPrice] = useState(0);

  const product = PRODUCTS.find((p) => p.id === selectedId)!;
  const calc = useMemo(() => calcProduct(product), [product]);

  const simCalc = useMemo(() => {
    const adjCosts = product.costs.map((c) => {
      if (c.name.includes("חומרי גלם")) return { ...c, amount: c.amount * (1 + simMat / 100) };
      if (c.name.includes("עבודה")) return { ...c, amount: c.amount * (1 + simLab / 100) };
      return c;
    });
    const adjPrice = product.salePrice * (1 + simPrice / 100);
    return { totalCost, grossProfit, grossMargin, adjPrice };
  }, [product, simMat, simLab, simPrice]);

  const kpis = [
    { label: "עלות חומרי גלם", value: fmt(product.costs[0].amount), icon: Package, accent: "text-blue-400" },
    { label: "עלות עבודה", value: fmt(product.costs[1].amount), icon: Users, accent: "text-purple-400" },
    { label: "תקורות", value: fmt(product.costs[2].amount), icon: Zap, accent: "text-yellow-400" },
    { label: "סה״כ עלות ייצור", value: fmt(calc.totalCost), icon: Calculator, accent: "text-orange-400" },
    { label: "מחיר מכירה", value: fmt(product.salePrice), icon: DollarSign, accent: "text-emerald-400" },
    { label: "רווח גולמי", value: pct(calc.grossMargin), icon: TrendingUp, accent: calc.grossMargin >= 30 ? "text-green-400" : "text-red-400" },
    { label: "רווח נקי", value: pct(calc.netMargin), icon: BarChart3, accent: calc.netMargin >= 20 ? "text-green-400" : "text-amber-400" },
  ];

  const sorted = useMemo(() => PRODUCTS.map((p) => ({ ...p, ...calcProduct(p) })).sort((a, b) => b.grossMargin - a.grossMargin), []);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20"><Calculator className="h-6 w-6 text-blue-400" /></div>
          <div>
            <h1 className="text-2xl font-bold">תמחור ורווחיות מוצרים</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי - ניתוח עלויות ומרווחים</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">עודכן: {new Date().toLocaleDateString("he-IL")}</Badge>
      </div>

      {/* Product Selector */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <label className="text-sm text-muted-foreground mb-2 block">בחר מוצר לניתוח</label>
          <select value={selectedId} onChange={(e) => setSelectedId(Number(e.target.value))}
            className="w-full bg-muted/50 border border-border rounded-lg p-2.5 text-foreground focus:ring-2 focus:ring-blue-500 focus:outline-none">
            {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/50">
            <CardContent className="p-3 text-center space-y-1">
              <k.icon className={`h-5 w-5 mx-auto ${k.accent}`} />
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-lg font-bold ${k.accent}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="breakdown">פירוט עלויות</TabsTrigger>
          <TabsTrigger value="compare">השוואת מוצרים</TabsTrigger>
          <TabsTrigger value="trends">מגמות</TabsTrigger>
          <TabsTrigger value="simulation">סימולציה</TabsTrigger>
        </TabsList>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-lg">פירוט עלויות - {product.name}</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-right py-3 px-2 font-medium">רכיב עלות</th>
                    <th className="text-left py-3 px-2 font-medium">סכום ₪</th>
                    <th className="text-left py-3 px-2 font-medium">% מסה״כ</th>
                    <th className="text-left py-3 px-2 font-medium w-48">נתח</th>
                  </tr>
                </thead>
                <tbody>
                  {product.costs.map((c) => {
                    const share = (c.amount / calc.totalCost) * 100;
                    return (
                      <tr key={c.name} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-3 px-2 flex items-center gap-2"><c.icon className={`h-4 w-4 ${c.color}`} />{c.name}</td>
                        <td className="py-3 px-2 font-mono font-medium">{fmt(c.amount)}</td>
                        <td className="py-3 px-2">{pct(share)}</td>
                        <td className="py-3 px-2"><Progress value={share} className="h-2" /></td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border font-bold bg-muted/20">
                    <td className="py-3 px-2">סה״כ עלות</td>
                    <td className="py-3 px-2 font-mono">{fmt(calc.totalCost)}</td>
                    <td className="py-3 px-2">100%</td><td />
                  </tr>
                  <tr className="text-emerald-400">
                    <td className="py-3 px-2 flex items-center gap-2"><DollarSign className="h-4 w-4" />מחיר מכירה</td>
                    <td className="py-3 px-2 font-mono font-bold">{fmt(product.salePrice)}</td><td /><td />
                  </tr>
                  <tr className="text-green-400 font-bold">
                    <td className="py-3 px-2 flex items-center gap-2"><TrendingUp className="h-4 w-4" />רווח גולמי</td>
                    <td className="py-3 px-2 font-mono">{fmt(calc.grossProfit)}</td>
                    <td className="py-3 px-2">{pct(calc.grossMargin)}</td><td />
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compare Tab */}
        <TabsContent value="compare" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><ArrowUpDown className="h-5 w-5 text-blue-400" />השוואת רווחיות מוצרים</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-right py-3 px-2 font-medium">מוצר</th>
                    <th className="text-left py-3 px-2 font-medium">עלות ₪</th>
                    <th className="text-left py-3 px-2 font-medium">מחיר ₪</th>
                    <th className="text-left py-3 px-2 font-medium">רווח ₪</th>
                    <th className="text-left py-3 px-2 font-medium">מרווח %</th>
                    <th className="text-left py-3 px-2 font-medium w-36">מרווח</th>
                  </tr>
                </thead>
                <tbody>
                  {PRODUCTS.map((p) => {
                    const c = calcProduct(p);
                    return (
                      <tr key={p.id} onClick={() => setSelectedId(p.id)}
                        className={`border-b border-border/30 hover:bg-muted/30 cursor-pointer ${p.id === selectedId ? "bg-blue-500/10" : ""}`}>
                        <td className="py-3 px-2 font-medium">{p.name}</td>
                        <td className="py-3 px-2 font-mono">{fmt(c.totalCost)}</td>
                        <td className="py-3 px-2 font-mono">{fmt(p.salePrice)}</td>
                        <td className="py-3 px-2 font-mono text-green-400">{fmt(c.grossProfit)}</td>
                        <td className="py-3 px-2">
                          <Badge variant={c.grossMargin >= 35 ? "default" : "secondary"} className={c.grossMargin >= 35 ? "bg-green-600" : ""}>{pct(c.grossMargin)}</Badge>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2"><Progress value={c.grossMargin} className="h-2 flex-1" /><span className="text-xs text-muted-foreground w-10">{pct(c.grossMargin)}</span></div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Card className="border-green-500/30 bg-green-500/5"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">הכי רווחי</p>
                  <p className="font-bold text-green-400">{sorted[0].name}</p>
                  <p className="text-sm text-green-400">{pct(sorted[0].grossMargin)}</p>
                </CardContent></Card>
                <Card className="border-blue-500/30 bg-blue-500/5"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">ממוצע מרווח</p>
                  <p className="font-bold text-blue-400">{pct(sorted.reduce((s, p) => s + p.grossMargin, 0) / sorted.length)}</p>
                </CardContent></Card>
                <Card className="border-red-500/30 bg-red-500/5"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">הכי פחות רווחי</p>
                  <p className="font-bold text-red-400">{sorted[sorted.length - 1].name}</p>
                  <p className="text-sm text-red-400">{pct(sorted[sorted.length - 1].grossMargin)}</p>
                </CardContent></Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-400" />מגמת עלויות - 6 חודשים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {TREND_DATA.map((t) => {
                  const total = t.materials + t.labor + t.overhead;
                  return (
                    <div key={t.month} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground w-20">{t.month}</span>
                        <span className="font-mono font-medium">{fmt(total)}</span>
                      </div>
                      <div className="flex h-5 rounded overflow-hidden gap-px">
                        <div className="bg-blue-500" style={{ width: `${(t.materials / 5000) * 100}%` }} title={`חומרים: ${fmt(t.materials)}`} />
                        <div className="bg-purple-500" style={{ width: `${(t.labor / 5000) * 100}%` }} title={`עבודה: ${fmt(t.labor)}`} />
                        <div className="bg-yellow-500" style={{ width: `${(t.overhead / 5000) * 100}%` }} title={`תקורות: ${fmt(t.overhead)}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-4 justify-center text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500" /> חומרי גלם</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500" /> עבודה</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500" /> תקורות</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: "שינוי חומרי גלם", val: ((2450 - 2300) / 2300) * 100, clr: "text-red-400" },
                  { label: "שינוי עלות עבודה", val: ((1200 - 1100) / 1100) * 100, clr: "text-amber-400" },
                  { label: "שינוי תקורות", val: ((380 - 350) / 350) * 100, clr: "text-yellow-400" },
                ].map((d) => (
                  <Card key={d.label} className="border-border/30"><CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className={`font-bold ${d.clr}`}>+{pct(d.val)}</p>
                  </CardContent></Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Simulation Tab */}
        <TabsContent value="simulation" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-blue-400" />סימולציית What-If - {product.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: "שינוי עלות חומרים", val: simMat, set: setSimMat, min: -30, max: 30, accent: "accent-blue-500" },
                  { label: "שינוי עלות עבודה", val: simLab, set: setSimLab, min: -30, max: 30, accent: "accent-purple-500" },
                  { label: "שינוי מחיר מכירה", val: simPrice, set: setSimPrice, min: -20, max: 20, accent: "accent-emerald-500" },
                ].map((s) => (
                  <div key={s.label} className="space-y-2">
                    <label className="text-sm font-medium flex justify-between">
                      <span>{s.label}</span>
                      <Badge variant={s.val > 0 ? "destructive" : s.val < 0 ? "default" : "secondary"}>
                        {s.val > 0 ? "+" : ""}{s.val}%
                      </Badge>
                    </label>
                    <input type="range" min={s.min} max={s.max} value={s.val}
                      onChange={(e) => s.set(Number(e.target.value))} className={`w-full ${s.accent}`} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{s.min}%</span><span>0</span><span>+{s.max}%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-border/30"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">עלות מתוקנת</p>
                  <p className="font-bold text-foreground">{fmt(Math.round(simCalc.totalCost))}</p>
                  <p className={`text-xs ${simCalc.totalCost > calc.totalCost ? "text-red-400" : "text-green-400"}`}>
                    {simCalc.totalCost > calc.totalCost ? "+" : ""}{fmt(Math.round(simCalc.totalCost - calc.totalCost))}
                  </p>
                </CardContent></Card>
                <Card className="border-border/30"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">מחיר מתוקן</p>
                  <p className="font-bold text-foreground">{fmt(Math.round(simCalc.adjPrice))}</p>
                </CardContent></Card>
                <Card className="border-border/30"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">רווח גולמי</p>
                  <p className={`font-bold ${simCalc.grossProfit > 0 ? "text-green-400" : "text-red-400"}`}>{fmt(Math.round(simCalc.grossProfit))}</p>
                </CardContent></Card>
                <Card className="border-border/30"><CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">מרווח גולמי</p>
                  <p className={`font-bold text-xl ${simCalc.grossMargin >= 30 ? "text-green-400" : simCalc.grossMargin >= 15 ? "text-amber-400" : "text-red-400"}`}>
                    {pct(simCalc.grossMargin)}
                  </p>
                  <p className={`text-xs ${simCalc.grossMargin >= calc.grossMargin ? "text-green-400" : "text-red-400"}`}>
                    {simCalc.grossMargin >= calc.grossMargin ? "+" : ""}{pct(simCalc.grossMargin - calc.grossMargin)} מהמקור
                  </p>
                </CardContent></Card>
              </div>
              <div className="text-center">
                <button onClick={() => { setSimMat(0); setSimLab(0); setSimPrice(0); }}
                  className="px-4 py-2 rounded-lg bg-muted/50 hover:bg-muted text-sm text-muted-foreground transition-colors">
                  איפוס סימולציה
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}