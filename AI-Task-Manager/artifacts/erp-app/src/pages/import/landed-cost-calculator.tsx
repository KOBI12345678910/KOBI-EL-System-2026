import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Calculator, DollarSign, Weight, Box, Ruler, TrendingUp, TrendingDown, Ship, Truck, FileText, Building2, Landmark, Package, BarChart3, AlertTriangle, CheckCircle } from "lucide-react";

interface CostComponent {
  key: string;
  label: string;
  category: string;
  actual: number;
  estimated: number;
  currency: "ILS" | "USD";
}

const FALLBACK_SHIPMENTS = [
  { id: "SHP-2026-001", supplier: "Foshan Glass Co.", origin: "סין", po: "PO-IM-001", weight: 12500, cbm: 28.5, units: 4200, meters: 1800, date: "2026-03-15" },
  { id: "SHP-2026-002", supplier: "Schuco International", origin: "גרמניה", po: "PO-IM-002", weight: 8200, cbm: 18.3, units: 1500, meters: 3200, date: "2026-03-22" },
  { id: "SHP-2026-003", supplier: "Alumil SA", origin: "יוון", po: "PO-IM-003", weight: 6800, cbm: 15.1, units: 2800, meters: 2100, date: "2026-04-01" },
];

const buildCosts = (shipIdx: number): CostComponent[] => {
  const bases: [string, string, string, number, number, "ILS" | "USD"][] = [
    ["supplier_price", "מחיר ספק", "supplier", [165000, 420000, 278000][shipIdx], [160000, 415000, 275000][shipIdx], "USD"],
    ["inland_transport_origin", "הובלה יבשתית - מקור", "origin", [3200, 4800, 2900][shipIdx], [3000, 5000, 3000][shipIdx], "USD"],
    ["export_handling", "טיפול יצוא", "origin", [1800, 2200, 1500][shipIdx], [1700, 2000, 1400][shipIdx], "USD"],
    ["freight_cost", "הובלה ימית / אווירית", "freight", [8500, 12000, 7200][shipIdx], [8000, 11500, 7000][shipIdx], "USD"],
    ["insurance", "ביטוח", "freight", [2400, 6300, 4170][shipIdx], [2200, 6000, 4000][shipIdx], "USD"],
    ["customs_duty", "מכס", "customs", [12000, 30000, 19500][shipIdx], [11500, 29000, 19000][shipIdx], "ILS"],
    ["purchase_tax", "מס קנייה", "customs", [4800, 12600, 8340][shipIdx], [4500, 12000, 8000][shipIdx], "ILS"],
    ["vat_on_import", "מע\"מ יבוא", "customs", [35000, 89000, 58500][shipIdx], [34000, 87000, 57000][shipIdx], "ILS"],
    ["port_fees", "אגרות נמל", "customs", [3200, 5400, 3800][shipIdx], [3000, 5000, 3500][shipIdx], "ILS"],
    ["clearance_fees", "שחרור ממכס", "port", [2800, 4200, 3100][shipIdx], [2500, 4000, 3000][shipIdx], "ILS"],
    ["broker_fees", "עמלת סוכן מכס", "port", [3500, 5800, 4200][shipIdx], [3200, 5500, 4000][shipIdx], "ILS"],
    ["storage_fees", "אחסנה בנמל", "port", [1200, 2400, 800][shipIdx], [1000, 2000, 1000][shipIdx], "ILS"],
    ["demurrage", "דמי השהיה (Demurrage)", "port", [0, 3200, 0][shipIdx], [0, 0, 0][shipIdx], "USD"],
    ["detention", "דמי עיכוב מכולה (Detention)", "destination", [0, 1800, 0][shipIdx], [0, 0, 0][shipIdx], "USD"],
    ["inland_transport_destination", "הובלה יבשתית - יעד", "destination", [4500, 6200, 3800][shipIdx], [4200, 6000, 3500][shipIdx], "ILS"],
    ["unloading_cost", "פריקה", "destination", [2200, 3500, 2000][shipIdx], [2000, 3200, 1800][shipIdx], "ILS"],
    ["inspection_cost", "בדיקות ותקינה", "admin", [1800, 3200, 2400][shipIdx], [1500, 3000, 2200][shipIdx], "ILS"],
    ["documentation_cost", "תיעוד ומסמכים", "admin", [800, 1200, 900][shipIdx], [800, 1200, 900][shipIdx], "ILS"],
    ["bank_transfer_cost", "עמלת העברה בנקאית", "admin", [350, 520, 380][shipIdx], [300, 500, 350][shipIdx], "ILS"],
    ["exchange_rate_cost", "עלות שער חליפין", "currency", [2800, 7200, 4500][shipIdx], [2000, 5000, 3500][shipIdx], "ILS"],
  ];
  return bases.map(([key, label, category, actual, estimated, currency]) => ({ key, label, category, actual, estimated, currency }));
};

const categoryMap: Record<string, { label: string; icon: any; color: string }> = {
  supplier: { label: "ספק", icon: Building2, color: "text-blue-400" },
  origin: { label: "מקור", icon: Truck, color: "text-cyan-400" },
  freight: { label: "הובלה וביטוח", icon: Ship, color: "text-indigo-400" },
  customs: { label: "מכס ומיסים", icon: Landmark, color: "text-amber-400" },
  port: { label: "נמל וטיפול", icon: Package, color: "text-orange-400" },
  destination: { label: "יעד", icon: Truck, color: "text-green-400" },
  admin: { label: "מנהלה", icon: FileText, color: "text-purple-400" },
  currency: { label: "מטבע", icon: DollarSign, color: "text-rose-400" },
};

const fmtILS = (v: number) => "₪" + v.toLocaleString("he-IL");
const fmtUSD = (v: number) => "$" + v.toLocaleString("en-US");
const fmtCur = (v: number, c: "ILS" | "USD") => c === "ILS" ? fmtILS(v) : fmtUSD(v);
const RATE = 3.65;

export default function LandedCostCalculator() {
  const { data: shipments = FALLBACK_SHIPMENTS } = useQuery({
    queryKey: ["import-shipments"],
    queryFn: async () => {
      const res = await authFetch("/api/import/landed-cost-calculator/shipments");
      if (!res.ok) return FALLBACK_SHIPMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SHIPMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [selectedShipment, setSelectedShipment] = useState(0);
  const [tab, setTab] = useState("breakdown");

  const shipment = shipments[selectedShipment];
  const costs = buildCosts(selectedShipment);

  const toILS = (c: CostComponent) => c.currency === "ILS" ? c.actual : c.actual * RATE;
  const toILSEst = (c: CostComponent) => c.currency === "ILS" ? c.estimated : c.estimated * RATE;

  const totalActual = costs.reduce((s, c) => s + toILS(c), 0);
  const totalEstimated = costs.reduce((s, c) => s + toILSEst(c), 0);
  const variance = totalActual - totalEstimated;
  const variancePct = totalEstimated > 0 ? (variance / totalEstimated) * 100 : 0;

  const perKg = totalActual / shipment.weight;
  const perCbm = totalActual / shipment.cbm;
  const perUnit = totalActual / shipment.units;
  const perMeter = totalActual / shipment.meters;

  const catTotals = Object.keys(categoryMap).map(cat => {
    const items = costs.filter(c => c.category === cat);
    const actual = items.reduce((s, c) => s + toILS(c), 0);
    const estimated = items.reduce((s, c) => s + toILSEst(c), 0);
    return { cat, actual, estimated, pct: totalActual > 0 ? (actual / totalActual) * 100 : 0 };
  });

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-7 w-7 text-blue-400" />
          מחשבון עלות נחיתה (Landed Cost)
        </h1>
        <Badge className="bg-blue-500/20 text-blue-400 text-sm">טכנו-כל עוזי</Badge>
      </div>

      {/* Shipment Selector */}
      <Card className="border-slate-700 bg-slate-900/60">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-3">בחר משלוח לחישוב</p>
          <div className="flex gap-3">
            {shipments.map((s, i) => (
              <button key={s.id} onClick={() => setSelectedShipment(i)}
                className={`flex-1 p-3 rounded-lg border text-right transition-all ${
                  selectedShipment === i
                    ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500"
                    : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                }`}>
                <p className="font-semibold text-sm">{s.id}</p>
                <p className="text-xs text-muted-foreground">{s.supplier}</p>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] px-1">{s.origin}</Badge>
                  <Badge variant="outline" className="text-[10px] px-1">{s.po}</Badge>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "עלות נחיתה כוללת", value: fmtILS(Math.round(totalActual)), icon: DollarSign, color: "text-emerald-400", border: "border-emerald-800" },
          { label: "עלות / ק\"ג", value: fmtILS(Math.round(perKg * 100) / 100), icon: Weight, color: "text-blue-400", border: "border-blue-800" },
          { label: "עלות / CBM", value: fmtILS(Math.round(perCbm)), icon: Box, color: "text-cyan-400", border: "border-cyan-800" },
          { label: "עלות / יחידה", value: fmtILS(Math.round(perUnit * 100) / 100), icon: Package, color: "text-purple-400", border: "border-purple-800" },
          { label: "עלות / מטר", value: fmtILS(Math.round(perMeter * 100) / 100), icon: Ruler, color: "text-amber-400", border: "border-amber-800" },
          { label: "סטייה מהערכה", value: `${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%`, icon: variance > 0 ? TrendingUp : TrendingDown, color: variance > 0 ? "text-red-400" : "text-green-400", border: variance > 0 ? "border-red-800" : "border-green-800" },
        ].map((c, i) => (
          <Card key={i} className={`${c.border} bg-slate-900/60`}>
            <CardContent className="pt-4 pb-3 text-center">
              <c.icon className={`h-5 w-5 mx-auto ${c.color} mb-1`} />
              <p className="text-[11px] text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="breakdown">פירוט רכיבים</TabsTrigger>
          <TabsTrigger value="categories">לפי קטגוריה</TabsTrigger>
          <TabsTrigger value="comparison">בפועל מול הערכה</TabsTrigger>
        </TabsList>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4 mt-4">
          <Card className="border-slate-700 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-400" /> 20 רכיבי עלות - פירוט מלא
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-xs w-8">#</TableHead>
                    <TableHead className="text-right text-xs">רכיב</TableHead>
                    <TableHead className="text-right text-xs">קטגוריה</TableHead>
                    <TableHead className="text-right text-xs">סכום</TableHead>
                    <TableHead className="text-right text-xs">בש"ח</TableHead>
                    <TableHead className="text-right text-xs">% מהכולל</TableHead>
                    <TableHead className="text-right text-xs w-32">נתח</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map((c, i) => {
                    const ilsVal = toILS(c);
                    const pct = totalActual > 0 ? (ilsVal / totalActual) * 100 : 0;
                    const catInfo = categoryMap[c.category];
                    return (
                      <TableRow key={c.key} className="border-slate-800 hover:bg-slate-800/50">
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{c.label}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${catInfo.color}`}>
                            {catInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{fmtCur(c.actual, c.currency)}</TableCell>
                        <TableCell className="text-sm font-mono">{fmtILS(Math.round(ilsVal))}</TableCell>
                        <TableCell className="text-sm">{pct.toFixed(1)}%</TableCell>
                        <TableCell>
                          <Progress value={pct} className="h-2" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-slate-700 bg-slate-800/80 font-bold">
                    <TableCell />
                    <TableCell className="text-sm">סה"כ עלות נחיתה</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-sm font-mono text-emerald-400">{fmtILS(Math.round(totalActual))}</TableCell>
                    <TableCell className="text-sm">100%</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4 mt-4">
          <div className="grid grid-cols-4 gap-3">
            {catTotals.map(ct => {
              const info = categoryMap[ct.cat];
              const Icon = info.icon;
              const catVariance = ct.actual - ct.estimated;
              const catVarPct = ct.estimated > 0 ? (catVariance / ct.estimated) * 100 : 0;
              return (
                <Card key={ct.cat} className="border-slate-700 bg-slate-900/60">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${info.color}`} />
                      <span className="text-sm font-semibold">{info.label}</span>
                    </div>
                    <p className={`text-lg font-bold ${info.color}`}>{fmtILS(Math.round(ct.actual))}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-muted-foreground">{ct.pct.toFixed(1)}% מהכולל</span>
                      <span className={`text-[11px] font-medium ${catVariance > 0 ? "text-red-400" : "text-green-400"}`}>
                        {catVariance > 0 ? "+" : ""}{catVarPct.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={ct.pct} className="h-1.5 mt-2" />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-slate-700 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">סיכום לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-xs">קטגוריה</TableHead>
                    <TableHead className="text-right text-xs">בפועל</TableHead>
                    <TableHead className="text-right text-xs">הערכה</TableHead>
                    <TableHead className="text-right text-xs">הפרש</TableHead>
                    <TableHead className="text-right text-xs">% מהכולל</TableHead>
                    <TableHead className="text-right text-xs w-36">נתח</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catTotals.map(ct => {
                    const info = categoryMap[ct.cat];
                    const diff = ct.actual - ct.estimated;
                    return (
                      <TableRow key={ct.cat} className="border-slate-800">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <info.icon className={`h-4 w-4 ${info.color}`} />
                            <span className="text-sm">{info.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{fmtILS(Math.round(ct.actual))}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{fmtILS(Math.round(ct.estimated))}</TableCell>
                        <TableCell className={`text-sm font-mono ${diff > 0 ? "text-red-400" : "text-green-400"}`}>
                          {diff > 0 ? "+" : ""}{fmtILS(Math.round(diff))}
                        </TableCell>
                        <TableCell className="text-sm">{ct.pct.toFixed(1)}%</TableCell>
                        <TableCell><Progress value={ct.pct} className="h-2" /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comparison Tab */}
        <TabsContent value="comparison" className="space-y-4 mt-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-slate-700 bg-slate-900/60">
              <CardContent className="pt-4 text-center">
                <p className="text-sm text-muted-foreground">בפועל</p>
                <p className="text-xl font-bold text-blue-400">{fmtILS(Math.round(totalActual))}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-900/60">
              <CardContent className="pt-4 text-center">
                <p className="text-sm text-muted-foreground">הערכה</p>
                <p className="text-xl font-bold text-slate-400">{fmtILS(Math.round(totalEstimated))}</p>
              </CardContent>
            </Card>
            <Card className={`${variance > 0 ? "border-red-800" : "border-green-800"} bg-slate-900/60`}>
              <CardContent className="pt-4 text-center">
                <p className="text-sm text-muted-foreground">סטייה</p>
                <p className={`text-xl font-bold ${variance > 0 ? "text-red-400" : "text-green-400"}`}>
                  {variance > 0 ? "+" : ""}{fmtILS(Math.round(variance))}
                  <span className="text-sm mr-1">({variancePct >= 0 ? "+" : ""}{variancePct.toFixed(1)}%)</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-700 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-amber-400" /> השוואה: בפועל מול הערכה
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-xs">#</TableHead>
                    <TableHead className="text-right text-xs">רכיב</TableHead>
                    <TableHead className="text-right text-xs">הערכה (₪)</TableHead>
                    <TableHead className="text-right text-xs">בפועל (₪)</TableHead>
                    <TableHead className="text-right text-xs">הפרש</TableHead>
                    <TableHead className="text-right text-xs">% סטייה</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map((c, i) => {
                    const actILS = toILS(c);
                    const estILS = toILSEst(c);
                    const diff = actILS - estILS;
                    const diffPct = estILS > 0 ? (diff / estILS) * 100 : 0;
                    const isOver = diff > 0;
                    const isBig = Math.abs(diffPct) > 5;
                    return (
                      <TableRow key={c.key} className={`border-slate-800 ${isBig && isOver ? "bg-red-950/20" : ""}`}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm">{c.label}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{fmtILS(Math.round(estILS))}</TableCell>
                        <TableCell className="text-sm font-mono">{fmtILS(Math.round(actILS))}</TableCell>
                        <TableCell className={`text-sm font-mono ${isOver ? "text-red-400" : "text-green-400"}`}>
                          {isOver ? "+" : ""}{fmtILS(Math.round(diff))}
                        </TableCell>
                        <TableCell className={`text-sm ${isOver ? "text-red-400" : "text-green-400"}`}>
                          {isOver ? "+" : ""}{diffPct.toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          {isBig && isOver ? (
                            <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                              <AlertTriangle className="h-3 w-3 ml-1" /> חריגה
                            </Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-400 text-[10px]">
                              <CheckCircle className="h-3 w-3 ml-1" /> תקין
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-slate-700 bg-slate-800/80 font-bold">
                    <TableCell />
                    <TableCell className="text-sm">סה"כ</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">{fmtILS(Math.round(totalEstimated))}</TableCell>
                    <TableCell className="text-sm font-mono">{fmtILS(Math.round(totalActual))}</TableCell>
                    <TableCell className={`text-sm font-mono ${variance > 0 ? "text-red-400" : "text-green-400"}`}>
                      {variance > 0 ? "+" : ""}{fmtILS(Math.round(variance))}
                    </TableCell>
                    <TableCell className={`text-sm ${variance > 0 ? "text-red-400" : "text-green-400"}`}>
                      {variancePct >= 0 ? "+" : ""}{variancePct.toFixed(1)}%
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shipment Details Footer */}
      <Card className="border-slate-700 bg-slate-900/60">
        <CardContent className="pt-4">
          <div className="grid grid-cols-6 gap-4 text-center">
            {[
              { label: "משקל", value: `${shipment.weight.toLocaleString()} ק"ג` },
              { label: "נפח", value: `${shipment.cbm} CBM` },
              { label: "יחידות", value: shipment.units.toLocaleString() },
              { label: "מטרים", value: `${shipment.meters.toLocaleString()} מ'` },
              { label: "שער המרה", value: `$1 = ₪${RATE}` },
              { label: "תאריך", value: shipment.date },
            ].map((d, i) => (
              <div key={i}>
                <p className="text-[11px] text-muted-foreground">{d.label}</p>
                <p className="text-sm font-semibold">{d.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
