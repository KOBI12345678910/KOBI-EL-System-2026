import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Calculator,
  Package,
  Hammer,
  Factory,
  TrendingUp,
  FileText,
  DollarSign,
  Percent,
  RotateCcw,
  Printer,
  Layers,
  Ruler,
} from "lucide-react";

interface MaterialItem {
  name: string;
  unit: string;
  pricePerUnit: number;
  quantity: number;
}

const defaultMaterials: MaterialItem[] = [
  { name: "אלומיניום פרופיל 6063-T5", unit: 'מ"ר', pricePerUnit: 185, quantity: 0 },
  { name: "זכוכית מחוסמת 8 מ\"מ", unit: 'מ"ר', pricePerUnit: 220, quantity: 0 },
  { name: "זכוכית בידוד כפולה Low-E", unit: 'מ"ר', pricePerUnit: 380, quantity: 0 },
  { name: "פלדה מגולוונת", unit: "ק\"ג", pricePerUnit: 12, quantity: 0 },
  { name: "אטמים ורצועות EPDM", unit: 'מ"א', pricePerUnit: 18, quantity: 0 },
  { name: "אביזרי נעילה ותפעול", unit: "יח'", pricePerUnit: 145, quantity: 0 },
];

export default function CostCalculator() {
  const [materials, setMaterials] = useState<MaterialItem[]>(defaultMaterials);
  const [laborHours, setLaborHours] = useState(0);
  const [laborRate, setLaborRate] = useState(120);
  const [overheadPct, setOverheadPct] = useState(15);
  const [marginTarget, setMarginTarget] = useState(25);
  const [projectName, setProjectName] = useState("");

  const updateQuantity = (index: number, qty: number) => {
    const updated = [...materials];
    updated[index] = { ...updated[index], quantity: qty };
    setMaterials(updated);
  };

  const materialCost = materials.reduce((s, m) => s + m.pricePerUnit * m.quantity, 0);
  const laborCost = laborHours * laborRate;
  const subtotal = materialCost + laborCost;
  const overheadCost = subtotal * (overheadPct / 100);
  const totalCost = subtotal + overheadCost;
  const marginAmount = totalCost * (marginTarget / 100);
  const quotePrice = totalCost + marginAmount;
  const pricePerSqm = materials[0].quantity > 0 ? quotePrice / materials[0].quantity : 0;

  const resetForm = () => {
    setMaterials(defaultMaterials);
    setLaborHours(0);
    setProjectName("");
  };

  const costBreakdown = [
    { label: "חומרי גלם", value: materialCost, pct: totalCost > 0 ? (materialCost / totalCost) * 100 : 0, color: "bg-blue-500" },
    { label: "עבודה", value: laborCost, pct: totalCost > 0 ? (laborCost / totalCost) * 100 : 0, color: "bg-green-500" },
    { label: "תקורה", value: overheadCost, pct: totalCost > 0 ? (overheadCost / totalCost) * 100 : 0, color: "bg-orange-500" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">מחשבון עלויות מוצר</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - חישוב עלות ומחיר לפרויקט</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetForm}><RotateCcw className="h-4 w-4 ml-2" />אפס</Button>
          <Button><Printer className="h-4 w-4 ml-2" />הדפס הצעה</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />פרטי פרויקט</CardTitle>
            </CardHeader>
            <CardContent>
              <Input placeholder="שם הפרויקט / הלקוח" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />חומרי גלם</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {materials.map((m, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-center p-3 border rounded-lg">
                    <div className="col-span-5">
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-muted-foreground">₪{m.pricePerUnit} / {m.unit}</div>
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={0}
                        placeholder={`כמות (${m.unit})`}
                        value={m.quantity || ""}
                        onChange={(e) => updateQuantity(i, Number(e.target.value))}
                      />
                    </div>
                    <div className="col-span-4 text-left">
                      <span className="font-bold">₪{(m.pricePerUnit * m.quantity).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="font-bold flex items-center gap-2"><Layers className="h-4 w-4" />סה"כ חומרים</span>
                  <span className="font-bold text-lg text-blue-700">₪{materialCost.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Hammer className="h-5 w-5" />עלות עבודה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">שעות עבודה</label>
                  <Input type="number" min={0} value={laborHours || ""} onChange={(e) => setLaborHours(Number(e.target.value))} placeholder="שעות" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">עלות לשעה (₪)</label>
                  <Input type="number" min={0} value={laborRate || ""} onChange={(e) => setLaborRate(Number(e.target.value))} placeholder="₪ לשעה" />
                </div>
              </div>
              <div className="flex justify-between items-center p-3 mt-3 bg-green-50 rounded-lg">
                <span className="font-bold flex items-center gap-2"><Hammer className="h-4 w-4" />סה"כ עבודה</span>
                <span className="font-bold text-lg text-green-700">₪{laborCost.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Factory className="h-5 w-5" />תקורה ורווח</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">אחוז תקורה (%)</label>
                  <Input type="number" min={0} max={100} value={overheadPct || ""} onChange={(e) => setOverheadPct(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">מרווח יעד (%)</label>
                  <Input type="number" min={0} max={100} value={marginTarget || ""} onChange={(e) => setMarginTarget(Number(e.target.value))} />
                </div>
              </div>
              <div className="flex justify-between items-center p-3 mt-3 bg-orange-50 rounded-lg">
                <span className="font-bold flex items-center gap-2"><Factory className="h-4 w-4" />תקורה</span>
                <span className="font-bold text-lg text-orange-700">₪{overheadCost.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-2 border-blue-200">
            <CardHeader className="bg-blue-50">
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />סיכום עלויות</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {costBreakdown.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-medium">₪{item.value.toLocaleString()}</span>
                  </div>
                  <Progress value={item.pct} className="h-2" />
                  <div className="text-xs text-muted-foreground text-left">{item.pct.toFixed(1)}%</div>
                </div>
              ))}
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between font-bold">
                  <span>עלות כוללת</span>
                  <span>₪{totalCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1"><Percent className="h-3 w-3" />מרווח ({marginTarget}%)</span>
                  <span className="text-green-600 font-medium">+ ₪{marginAmount.toLocaleString()}</span>
                </div>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between text-xl font-bold text-blue-700">
                  <span className="flex items-center gap-2"><DollarSign className="h-5 w-5" />מחיר הצעה</span>
                  <span>₪{quotePrice.toLocaleString()}</span>
                </div>
              </div>
              {pricePerSqm > 0 && (
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                  <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />מחיר למ"ר</span>
                  <span className="font-bold">₪{pricePerSqm.toFixed(0)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">פירוט עלות</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {materials.filter((m) => m.quantity > 0).map((m, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                    <span className="text-muted-foreground">{m.name}</span>
                    <span>₪{(m.pricePerUnit * m.quantity).toLocaleString()}</span>
                  </div>
                ))}
                {laborCost > 0 && (
                  <div className="flex justify-between text-sm py-1 border-b">
                    <span className="text-muted-foreground">עבודה ({laborHours} שעות)</span>
                    <span>₪{laborCost.toLocaleString()}</span>
                  </div>
                )}
                {overheadCost > 0 && (
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-muted-foreground">תקורה ({overheadPct}%)</span>
                    <span>₪{overheadCost.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
                <div className="text-2xl font-bold text-emerald-600">{marginTarget}%</div>
                <div className="text-sm text-muted-foreground">מרווח יעד</div>
                <Badge className="mt-2" variant="outline">
                  {marginTarget >= 25 ? "מרווח מומלץ" : marginTarget >= 15 ? "מרווח סביר" : "מרווח נמוך"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
