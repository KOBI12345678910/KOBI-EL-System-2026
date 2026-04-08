import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calculator, Package, Wrench, Building2, TrendingUp, Save,
  Download, Plus, Search, Eye, Edit2, RotateCcw, Percent,
  DollarSign, Layers, Clock
} from "lucide-react";

const materials = [
  { name: "אלומיניום פרופיל T-60", unit: "מ״ר", pricePerUnit: 185, qty: 12 },
  { name: "זכוכית מחוסמת 10מ\"מ", unit: "מ״ר", pricePerUnit: 320, qty: 8 },
  { name: "חומר איטום EPDM", unit: "מטר", pricePerUnit: 18, qty: 24 },
  { name: "ברגי נירוסטה M8", unit: "יח׳", pricePerUnit: 2.5, qty: 96 },
  { name: "צבע אלקטרוסטטי", unit: "ק\"ג", pricePerUnit: 65, qty: 3 },
];

const laborSteps = [
  { name: "חיתוך פרופילים", hours: 4, ratePerHour: 120 },
  { name: "ריתוך ואיחוי", hours: 6, ratePerHour: 150 },
  { name: "הרכבת זכוכית", hours: 3, ratePerHour: 130 },
  { name: "צביעה וגימור", hours: 2, ratePerHour: 110 },
  { name: "בקרת איכות", hours: 1, ratePerHour: 140 },
  { name: "אריזה והכנה למשלוח", hours: 1.5, ratePerHour: 100 },
];

const savedCalculations = [
  { id: "CC-001", product: "חלון אלומיניום 1.5x1.2 מ׳", material: 5420, labor: 2535, overhead: 1591, total: 9546, margin: 25, finalPrice: 11933, date: "2026-04-05", status: "מאושר" },
  { id: "CC-002", product: "דלת כניסה אלומיניום+זכוכית", material: 8200, labor: 3800, overhead: 2400, total: 14400, margin: 30, finalPrice: 18720, date: "2026-04-03", status: "מאושר" },
  { id: "CC-003", product: "מעקה בטיחות 3 מטר", material: 2100, labor: 1200, overhead: 660, total: 3960, margin: 35, finalPrice: 5346, date: "2026-04-01", status: "טיוטה" },
  { id: "CC-004", product: "חזית חנות ויטרינה 4x3", material: 15800, labor: 7200, overhead: 4600, total: 27600, margin: 22, finalPrice: 33672, date: "2026-03-28", status: "מאושר" },
  { id: "CC-005", product: "פרגולה אלומיניום 4x4", material: 9500, labor: 4100, overhead: 2720, total: 16320, margin: 28, finalPrice: 20890, date: "2026-03-25", status: "מחושב" },
  { id: "CC-006", product: "תריס גלילה חשמלי 2x1.5", material: 3200, labor: 1800, overhead: 1000, total: 6000, margin: 30, finalPrice: 7800, date: "2026-03-20", status: "מאושר" },
];

const statusColors: Record<string, string> = {
  "טיוטה": "bg-slate-500/20 text-slate-300",
  "מחושב": "bg-blue-500/20 text-blue-300",
  "מאושר": "bg-green-500/20 text-green-300",
  "ארכיון": "bg-purple-500/20 text-purple-300",
};

export default function PricingCostCalculator() {
  const [activeTab, setActiveTab] = useState("calculator");
  const [overheadPercent, setOverheadPercent] = useState(20);
  const [marginPercent, setMarginPercent] = useState(25);
  const [productName, setProductName] = useState("חלון אלומיניום 1.5x1.2 מ׳");

  const materialTotal = useMemo(() =>
    materials.reduce((sum, m) => sum + m.pricePerUnit * m.qty, 0),
  []);

  const laborTotal = useMemo(() =>
    laborSteps.reduce((sum, l) => sum + l.hours * l.ratePerHour, 0),
  []);

  const overheadTotal = Math.round((materialTotal + laborTotal) * (overheadPercent / 100));
  const costTotal = materialTotal + laborTotal + overheadTotal;
  const finalPrice = Math.round(costTotal * (1 + marginPercent / 100));
  const profit = finalPrice - costTotal;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator className="h-7 w-7 text-emerald-400" />
            מחשבון עלויות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">חישוב עלות מוצר: חומרים + עבודה + תקורה | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא PDF</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Save className="w-4 h-4 ml-1" />שמירה</Button>
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-950 border-blue-800/50">
          <CardContent className="p-4">
            <p className="text-xs text-blue-400">עלות חומרים</p>
            <p className="text-xl font-bold text-blue-300">{materialTotal.toLocaleString()} &#8362;</p>
            <Progress value={(materialTotal / costTotal) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/50 to-amber-950 border-amber-800/50">
          <CardContent className="p-4">
            <p className="text-xs text-amber-400">עלות עבודה</p>
            <p className="text-xl font-bold text-amber-300">{laborTotal.toLocaleString()} &#8362;</p>
            <Progress value={(laborTotal / costTotal) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/50 to-purple-950 border-purple-800/50">
          <CardContent className="p-4">
            <p className="text-xs text-purple-400">תקורה ({overheadPercent}%)</p>
            <p className="text-xl font-bold text-purple-300">{overheadTotal.toLocaleString()} &#8362;</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">עלות כוללת</p>
            <p className="text-xl font-bold text-white">{costTotal.toLocaleString()} &#8362;</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-900/50 to-emerald-950 border-emerald-800/50">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-400">מחיר מכירה ({marginPercent}% רווח)</p>
            <p className="text-xl font-bold text-emerald-300">{finalPrice.toLocaleString()} &#8362;</p>
            <p className="text-xs text-emerald-500 mt-1">רווח: {profit.toLocaleString()} &#8362;</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-background/50">
          <TabsTrigger value="calculator">מחשבון</TabsTrigger>
          <TabsTrigger value="saved">חישובים שמורים ({savedCalculations.length})</TabsTrigger>
        </TabsList>

        {/* Calculator Tab */}
        <TabsContent value="calculator" className="mt-4 space-y-4">
          {/* Product Name */}
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-foreground whitespace-nowrap">שם המוצר:</label>
                <Input value={productName} onChange={e => setProductName(e.target.value)} className="bg-background/50 max-w-md" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">תקורה %:</label>
                  <Input type="number" value={overheadPercent} onChange={e => setOverheadPercent(Number(e.target.value))} className="bg-background/50 w-20" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">רווח %:</label>
                  <Input type="number" value={marginPercent} onChange={e => setMarginPercent(Number(e.target.value))} className="bg-background/50 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Materials Table */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-400" />
                  חומרי גלם
                </CardTitle>
                <Button variant="outline" size="sm"><Plus className="w-3 h-3 ml-1" />הוסף חומר</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-right p-3 text-muted-foreground font-medium">חומר</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">יחידה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מחיר/יחידה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">כמות</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="p-3 text-foreground font-medium">{m.name}</td>
                      <td className="p-3 text-muted-foreground">{m.unit}</td>
                      <td className="p-3 text-foreground">{m.pricePerUnit.toLocaleString()} &#8362;</td>
                      <td className="p-3 text-foreground">{m.qty}</td>
                      <td className="p-3 text-foreground font-bold">{(m.pricePerUnit * m.qty).toLocaleString()} &#8362;</td>
                    </tr>
                  ))}
                  <tr className="bg-blue-950/30">
                    <td colSpan={4} className="p-3 text-blue-300 font-bold text-left">סה״כ חומרים</td>
                    <td className="p-3 text-blue-300 font-bold">{materialTotal.toLocaleString()} &#8362;</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Labor Table */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  עבודה
                </CardTitle>
                <Button variant="outline" size="sm"><Plus className="w-3 h-3 ml-1" />הוסף שלב</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-right p-3 text-muted-foreground font-medium">שלב עבודה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">שעות</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">תעריף/שעה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {laborSteps.map((l, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="p-3 text-foreground font-medium">{l.name}</td>
                      <td className="p-3 text-foreground">{l.hours}</td>
                      <td className="p-3 text-foreground">{l.ratePerHour} &#8362;</td>
                      <td className="p-3 text-foreground font-bold">{(l.hours * l.ratePerHour).toLocaleString()} &#8362;</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-950/30">
                    <td colSpan={3} className="p-3 text-amber-300 font-bold text-left">סה״כ עבודה ({laborSteps.reduce((s, l) => s + l.hours, 0)} שעות)</td>
                    <td className="p-3 text-amber-300 font-bold">{laborTotal.toLocaleString()} &#8362;</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Final Summary */}
          <Card className="bg-gradient-to-br from-emerald-900/30 to-emerald-950/50 border-emerald-800/50">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">חומרים</p>
                  <p className="text-lg font-bold text-blue-300">{materialTotal.toLocaleString()} &#8362;</p>
                  <p className="text-xs text-muted-foreground">{Math.round((materialTotal / costTotal) * 100)}% מהעלות</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">עבודה</p>
                  <p className="text-lg font-bold text-amber-300">{laborTotal.toLocaleString()} &#8362;</p>
                  <p className="text-xs text-muted-foreground">{Math.round((laborTotal / costTotal) * 100)}% מהעלות</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">תקורה</p>
                  <p className="text-lg font-bold text-purple-300">{overheadTotal.toLocaleString()} &#8362;</p>
                  <p className="text-xs text-muted-foreground">{Math.round((overheadTotal / costTotal) * 100)}% מהעלות</p>
                </div>
                <div className="bg-emerald-900/30 rounded-lg p-2">
                  <p className="text-xs text-emerald-400">מחיר מכירה סופי</p>
                  <p className="text-2xl font-bold text-emerald-300">{finalPrice.toLocaleString()} &#8362;</p>
                  <p className="text-xs text-emerald-500">רווח: {profit.toLocaleString()} &#8362; ({marginPercent}%)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Saved Calculations Tab */}
        <TabsContent value="saved" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חומרים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עבודה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תקורה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות כוללת</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">רווח %</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחיר סופי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedCalculations.map(row => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-mono text-xs text-foreground">{row.id}</td>
                        <td className="p-3 text-foreground font-medium">{row.product}</td>
                        <td className="p-3 text-blue-300">{row.material.toLocaleString()} &#8362;</td>
                        <td className="p-3 text-amber-300">{row.labor.toLocaleString()} &#8362;</td>
                        <td className="p-3 text-purple-300">{row.overhead.toLocaleString()} &#8362;</td>
                        <td className="p-3 text-foreground font-bold">{row.total.toLocaleString()} &#8362;</td>
                        <td className="p-3 text-emerald-300">{row.margin}%</td>
                        <td className="p-3 text-emerald-300 font-bold">{row.finalPrice.toLocaleString()} &#8362;</td>
                        <td className="p-3 text-muted-foreground">{row.date}</td>
                        <td className="p-3"><Badge className={statusColors[row.status] || ""}>{row.status}</Badge></td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm"><Edit2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
