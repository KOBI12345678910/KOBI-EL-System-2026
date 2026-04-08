import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GitCompareArrows, Plus, Minus, Pencil, Equal, Search,
  ClipboardList, Factory, Warehouse, Truck, Clock, AlertTriangle,
  ArrowLeftRight, ChevronDown, FileText, Download,
} from "lucide-react";
import { useState } from "react";

type Delta = "added" | "removed" | "changed" | "unchanged";

interface BomLine {
  name: string;
  sku: string;
  qtyLeft: number | null;
  qtyRight: number | null;
  costLeft: number | null;
  costRight: number | null;
  unit: string;
  delta: Delta;
}

const bomLines: BomLine[] = [
  { name: "פרופיל אלומיניום ראשי 6063-T5", sku: "ALU-6063-100", qtyLeft: 4, qtyRight: 4, costLeft: 128.00, costRight: 128.00, unit: 'מ"ט', delta: "unchanged" },
  { name: "פרופיל אלומיניום חיזוק", sku: "ALU-6063-RNF", qtyLeft: 2, qtyRight: 3, costLeft: 64.00, costRight: 96.00, unit: 'מ"ט', delta: "changed" },
  { name: "זכוכית מחוסמת 5 מ\"מ", sku: "GLS-TMP-005", qtyLeft: 1, qtyRight: 1, costLeft: 185.00, costRight: 185.00, unit: "יח'", delta: "unchanged" },
  { name: "זכוכית Low-E כפולה", sku: "GLS-LOWE-D10", qtyLeft: null, qtyRight: 1, costLeft: null, costRight: 245.00, unit: "יח'", delta: "added" },
  { name: "אטם EPDM פנימי", sku: "SEL-EPDM-INT", qtyLeft: 4.2, qtyRight: 4.2, costLeft: 12.60, costRight: 12.60, unit: 'מ"ט', delta: "unchanged" },
  { name: "אטם EPDM חיצוני", sku: "SEL-EPDM-EXT", qtyLeft: 4.2, qtyRight: 4.5, costLeft: 12.60, costRight: 13.50, unit: 'מ"ט', delta: "changed" },
  { name: "בורג נירוסטה M6x20", sku: "SCR-SS-M6-20", qtyLeft: 16, qtyRight: 20, costLeft: 8.00, costRight: 10.00, unit: "יח'", delta: "changed" },
  { name: "דיבל פלסטיק 8 מ\"מ", sku: "DBL-PLS-008", qtyLeft: 8, qtyRight: 8, costLeft: 4.00, costRight: 4.00, unit: "יח'", delta: "unchanged" },
  { name: "ציר אלומיניום כבד", sku: "HNG-ALU-HD", qtyLeft: 2, qtyRight: 2, costLeft: 34.00, costRight: 34.00, unit: "יח'", delta: "unchanged" },
  { name: "ידית חלון נעילה T-Lock", sku: "HDL-TLCK-SLV", qtyLeft: 1, qtyRight: 1, costLeft: 42.00, costRight: 42.00, unit: "יח'", delta: "unchanged" },
  { name: "מנגנון הטיה ופתיחה", sku: "MCH-TT-001", qtyLeft: 1, qtyRight: 1, costLeft: 78.00, costRight: 78.00, unit: "יח'", delta: "unchanged" },
  { name: "סיליקון UV עמיד", sku: "SIL-UV-CLR", qtyLeft: 0.3, qtyRight: 0.35, costLeft: 9.00, costRight: 10.50, unit: "ליטר", delta: "changed" },
  { name: "טרמל ברייק PA66", sku: "TBR-PA66-25", qtyLeft: null, qtyRight: 2, costLeft: null, costRight: 56.00, unit: 'מ"ט', delta: "added" },
  { name: "פס אלומיניום דקורטיבי", sku: "ALU-DEC-GLD", qtyLeft: 2, qtyRight: null, costLeft: 26.00, costRight: null, unit: 'מ"ט', delta: "removed" },
  { name: "אגוז מרתק M6", sku: "NUT-RVT-M6", qtyLeft: 16, qtyRight: 20, costLeft: 4.80, costRight: 6.00, unit: "יח'", delta: "changed" /* removed */ },
  { name: "פרופיל ניקוז מים", sku: "ALU-DRN-010", qtyLeft: null, qtyRight: 1.2, costLeft: null, costRight: 18.00, unit: 'מ"ט', delta: "added" },
  { name: "משטח הגנה PE", sku: "FLM-PE-PROT", qtyLeft: 2, qtyRight: 2, costLeft: 6.00, costRight: 6.00, unit: 'מ"ר', delta: "unchanged" },
];

const deltaConfig: Record<Delta, { label: string; color: string; bg: string; icon: typeof Plus }> = {
  added:     { label: "נוסף",    color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30",  icon: Plus },
  removed:   { label: "הוסר",    color: "text-red-600",   bg: "bg-red-50 dark:bg-red-950/30",    icon: Minus },
  changed:   { label: "שונה",    color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", icon: Pencil },
  unchanged: { label: "ללא שינוי", color: "text-gray-400", bg: "",                                icon: Equal },
};

export default function BomComparisonPage() {
  const [search, setSearch] = useState("");

  const filtered = bomLines.filter(
    (l) => l.name.includes(search) || l.sku.toLowerCase().includes(search.toLowerCase())
  );

  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  bomLines.forEach((l) => counts[l.delta]++);

  const totalCostLeft = bomLines.reduce((s, l) => s + (l.costLeft ?? 0), 0);
  const totalCostRight = bomLines.reduce((s, l) => s + (l.costRight ?? 0), 0);
  const costDelta = totalCostRight - totalCostLeft;

  const kpis = [
    { label: "רכיבים בהשוואה", value: bomLines.length, icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/40" },
    { label: "רכיבים שנוספו", value: counts.added, icon: Plus, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/40" },
    { label: "רכיבים שהוסרו", value: counts.removed, icon: Minus, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/40" },
    { label: "רכיבים ששונו", value: counts.changed + counts.added + counts.removed, icon: Pencil, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/40" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitCompareArrows className="h-7 w-7 text-indigo-600" />
          השוואת עץ מוצר (BOM)
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="h-4 w-4 ml-1" />ייצוא לאקסל</Button>
          <Button variant="outline" size="sm"><FileText className="h-4 w-4 ml-1" />הפקת דו"ח</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-6 w-6 ${k.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold">{k.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* BOM Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-indigo-500" /> בחירת BOMs להשוואה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left BOM */}
            <div className="border rounded-lg p-4 space-y-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <Badge className="bg-blue-600 text-white">BOM א' (בסיס)</Badge>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">מוצר</p>
                <p className="font-semibold">חלון אלומיניום 100x120</p>
                <p className="text-sm text-muted-foreground">גרסה</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v2.1</Badge>
                  <span className="text-xs text-muted-foreground">מתאריך 15/01/2026</span>
                </div>
                <p className="text-sm text-muted-foreground">מק"ט מוצר</p>
                <p className="font-mono text-sm">WIN-ALU-100120</p>
                <p className="text-sm">סה"כ רכיבים: <span className="font-bold">{bomLines.filter(l => l.qtyLeft !== null).length}</span></p>
                <p className="text-sm">עלות כוללת: <span className="font-bold">₪{totalCostLeft.toFixed(2)}</span></p>
              </div>
            </div>
            {/* Right BOM */}
            <div className="border rounded-lg p-4 space-y-3 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
              <Badge className="bg-emerald-600 text-white">BOM ב' (חדש)</Badge>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">מוצר</p>
                <p className="font-semibold">חלון אלומיניום 100x120</p>
                <p className="text-sm text-muted-foreground">גרסה</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v3.0</Badge>
                  <span className="text-xs text-muted-foreground">מתאריך 02/04/2026</span>
                </div>
                <p className="text-sm text-muted-foreground">מק"ט מוצר</p>
                <p className="font-mono text-sm">WIN-ALU-100120</p>
                <p className="text-sm">סה"כ רכיבים: <span className="font-bold">{bomLines.filter(l => l.qtyRight !== null).length}</span></p>
                <p className="text-sm">עלות כוללת: <span className="font-bold">₪{totalCostRight.toFixed(2)}</span></p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for detailed sections */}
      <Tabs defaultValue="comparison" className="space-y-4">
        <TabsList>
          <TabsTrigger value="comparison">השוואה מפורטת</TabsTrigger>
          <TabsTrigger value="summary">סיכום שינויים</TabsTrigger>
          <TabsTrigger value="impact">השפעה</TabsTrigger>
        </TabsList>

        {/* Detailed Comparison Tab */}
        <TabsContent value="comparison">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">השוואה מפורטת - רכיב לרכיב</CardTitle>
              <div className="relative w-64">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder='חיפוש לפי שם / מק"ט...'
                  className="pr-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right w-10">#</TableHead>
                      <TableHead className="text-right">שם רכיב</TableHead>
                      <TableHead className="text-right">מק"ט</TableHead>
                      <TableHead className="text-center">כמות v2.1</TableHead>
                      <TableHead className="text-center">כמות v3.0</TableHead>
                      <TableHead className="text-center">הפרש</TableHead>
                      <TableHead className="text-left">עלות v2.1 ₪</TableHead>
                      <TableHead className="text-left">עלות v3.0 ₪</TableHead>
                      <TableHead className="text-left">הפרש עלות ₪</TableHead>
                      <TableHead className="text-center">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((line, idx) => {
                      const dc = deltaConfig[line.delta];
                      const qtyDelta = (line.qtyRight ?? 0) - (line.qtyLeft ?? 0);
                      const cDelta = (line.costRight ?? 0) - (line.costLeft ?? 0);
                      return (
                        <TableRow key={idx} className={dc.bg}>
                          <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{line.name}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{line.sku}</TableCell>
                          <TableCell className="text-center">{line.qtyLeft !== null ? `${line.qtyLeft} ${line.unit}` : "—"}</TableCell>
                          <TableCell className="text-center">{line.qtyRight !== null ? `${line.qtyRight} ${line.unit}` : "—"}</TableCell>
                          <TableCell className="text-center">
                            {line.delta === "unchanged" ? (
                              <span className="text-gray-400">0</span>
                            ) : (
                              <span className={dc.color + " font-semibold"}>
                                {qtyDelta > 0 ? `+${qtyDelta}` : qtyDelta === 0 ? "—" : qtyDelta}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-left tabular-nums">{line.costLeft !== null ? line.costLeft.toFixed(2) : "—"}</TableCell>
                          <TableCell className="text-left tabular-nums">{line.costRight !== null ? line.costRight.toFixed(2) : "—"}</TableCell>
                          <TableCell className="text-left tabular-nums">
                            {line.delta === "unchanged" ? (
                              <span className="text-gray-400">0.00</span>
                            ) : (
                              <span className={cDelta >= 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                                {cDelta > 0 ? `+${cDelta.toFixed(2)}` : cDelta.toFixed(2)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={`${dc.color} bg-transparent border-0 gap-1`}>
                              <dc.icon className="h-3 w-3" />
                              {dc.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals row */}
                    <TableRow className="bg-muted/60 font-bold border-t-2">
                      <TableCell colSpan={3} className="text-right">סה"כ</TableCell>
                      <TableCell className="text-center">{bomLines.filter(l => l.qtyLeft !== null).length} רכיבים</TableCell>
                      <TableCell className="text-center">{bomLines.filter(l => l.qtyRight !== null).length} רכיבים</TableCell>
                      <TableCell />
                      <TableCell className="text-left tabular-nums">₪{totalCostLeft.toFixed(2)}</TableCell>
                      <TableCell className="text-left tabular-nums">₪{totalCostRight.toFixed(2)}</TableCell>
                      <TableCell className="text-left tabular-nums">
                        <span className={costDelta >= 0 ? "text-red-600" : "text-green-600"}>
                          {costDelta >= 0 ? "+" : ""}₪{costDelta.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Change Summary Tab */}
        <TabsContent value="summary">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <Plus className="h-5 w-5 text-green-600" />
                    <span className="font-semibold text-green-600">רכיבים שנוספו</span>
                  </div>
                  <p className="text-3xl font-bold text-green-600">{counts.added}</p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {bomLines.filter(l => l.delta === "added").map((l, i) => (
                      <li key={i} className="flex items-center gap-1"><Plus className="h-3 w-3 text-green-500" />{l.name}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <Minus className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-600">רכיבים שהוסרו</span>
                  </div>
                  <p className="text-3xl font-bold text-red-600">{counts.removed}</p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {bomLines.filter(l => l.delta === "removed").map((l, i) => (
                      <li key={i} className="flex items-center gap-1"><Minus className="h-3 w-3 text-red-500" />{l.name}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <Pencil className="h-5 w-5 text-amber-600" />
                    <span className="font-semibold text-amber-600">כמות / עלות שונו</span>
                  </div>
                  <p className="text-3xl font-bold text-amber-600">{counts.changed}</p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {bomLines.filter(l => l.delta === "changed").map((l, i) => (
                      <li key={i} className="flex items-center gap-1"><Pencil className="h-3 w-3 text-amber-500" />{l.name}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-gray-200 dark:border-gray-700">
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <Equal className="h-5 w-5 text-gray-400" />
                    <span className="font-semibold text-gray-500">ללא שינוי</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-500">{counts.unchanged}</p>
                  <p className="text-sm text-muted-foreground">{counts.unchanged} רכיבים זהים בין שתי הגרסאות</p>
                </CardContent>
              </Card>
            </div>

            {/* Cost delta summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">סיכום עלויות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">עלות BOM v2.1</p>
                    <p className="text-2xl font-bold">₪{totalCostLeft.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">עלות BOM v3.0</p>
                    <p className="text-2xl font-bold">₪{totalCostRight.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">הפרש עלות</p>
                    <p className={`text-2xl font-bold ${costDelta >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {costDelta >= 0 ? "+" : ""}₪{costDelta.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ({((costDelta / totalCostLeft) * 100).toFixed(1)}% {costDelta >= 0 ? "עלייה" : "ירידה"})
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>התקדמות מעבר ל-v3.0</span>
                    <span className="font-semibold">65%</span>
                  </div>
                  <Progress value={65} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Impact Tab */}
        <TabsContent value="impact">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Production Orders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Factory className="h-5 w-5 text-indigo-500" /> הזמנות ייצור מושפעות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { id: "WO-2026-1847", customer: "קבלן שמעון לוי", qty: 24, status: "בייצור", urgency: "high" },
                  { id: "WO-2026-1853", customer: "פרויקט מגדלי הים", qty: 120, status: "ממתין לחומרים", urgency: "medium" },
                  { id: "WO-2026-1861", customer: "שיפוץ בניין עירייה", qty: 48, status: "מתוכנן", urgency: "low" },
                ].map((wo, i) => (
                  <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <p className="font-mono font-semibold text-sm">{wo.id}</p>
                      <p className="text-sm text-muted-foreground">{wo.customer}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-sm">{wo.qty} יח'</p>
                      <Badge variant="outline" className={
                        wo.urgency === "high" ? "border-red-300 text-red-600" :
                        wo.urgency === "medium" ? "border-amber-300 text-amber-600" :
                        "border-green-300 text-green-600"
                      }>{wo.status}</Badge>
                    </div>
                  </div>
                ))}
                <p className="text-sm text-muted-foreground">סה"כ 192 יחידות מושפעות ב-3 הזמנות פתוחות</p>
              </CardContent>
            </Card>

            {/* Inventory Impact */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Warehouse className="h-5 w-5 text-orange-500" /> השפעה על מלאי
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { item: "זכוכית Low-E כפולה", sku: "GLS-LOWE-D10", action: "נדרשת הזמנה", stock: 0, needed: 192, color: "text-red-600" },
                  { item: "טרמל ברייק PA66", sku: "TBR-PA66-25", action: "נדרשת הזמנה", stock: 40, needed: 384, color: "text-red-600" },
                  { item: "פרופיל ניקוז מים", sku: "ALU-DRN-010", action: "נדרשת הזמנה", stock: 15, needed: 230, color: "text-amber-600" },
                  { item: "פס אלומיניום דקורטיבי", sku: "ALU-DEC-GLD", action: "עודף מלאי", stock: 320, needed: 0, color: "text-green-600" },
                ].map((inv, i) => (
                  <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <p className="font-medium text-sm">{inv.item}</p>
                      <p className="font-mono text-xs text-muted-foreground">{inv.sku}</p>
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-semibold ${inv.color}`}>{inv.action}</p>
                      <p className="text-xs text-muted-foreground">מלאי: {inv.stock} | נדרש: {inv.needed}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Supplier Changes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Truck className="h-5 w-5 text-blue-500" /> שינויים נדרשים מול ספקים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { supplier: "Foshan Glass Co.", change: "הוספת זכוכית Low-E לקטלוג הזמנות", lead: "21 ימים", priority: "high" },
                  { supplier: "קבוצת אלומיל", change: "הזמנת פרופיל ניקוז - מק\"ט חדש", lead: "14 ימים", priority: "medium" },
                  { supplier: "Ensinger GmbH", change: "טרמל ברייק PA66 - פתיחת ספק חדש", lead: "30 ימים", priority: "high" },
                  { supplier: "כימיקלים בע\"מ", change: "עדכון כמות סיליקון בהזמנה קבועה", lead: "3 ימים", priority: "low" },
                ].map((sup, i) => (
                  <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <p className="font-medium text-sm">{sup.supplier}</p>
                      <p className="text-xs text-muted-foreground">{sup.change}</p>
                    </div>
                    <div className="text-left">
                      <Badge variant="outline" className={
                        sup.priority === "high" ? "border-red-300 text-red-600" :
                        sup.priority === "medium" ? "border-amber-300 text-amber-600" :
                        "border-green-300 text-green-600"
                      }>
                        {sup.priority === "high" ? "דחוף" : sup.priority === "medium" ? "בינוני" : "נמוך"}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">Lead Time: {sup.lead}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Implementation Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-purple-500" /> לוח זמנים ליישום
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { phase: "אישור הנדסי של BOM v3.0", days: "1-3", progress: 100, status: "הושלם" },
                  { phase: "פתיחת ספק Ensinger + הזמנה ראשונה", days: "4-14", progress: 45, status: "בתהליך" },
                  { phase: "קבלת דגימות ובדיקות איכות", days: "15-28", progress: 0, status: "ממתין" },
                  { phase: "עדכון הוראות עבודה וקווי ייצור", days: "29-35", progress: 0, status: "ממתין" },
                  { phase: "ייצור ראשון לפי BOM v3.0", days: "36-42", progress: 0, status: "מתוכנן" },
                ].map((p, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.phase}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">ימים {p.days}</span>
                        <Badge variant="outline" className={
                          p.progress === 100 ? "border-green-300 text-green-600" :
                          p.progress > 0 ? "border-blue-300 text-blue-600" :
                          "border-gray-300 text-gray-500"
                        }>{p.status}</Badge>
                      </div>
                    </div>
                    <Progress value={p.progress} className="h-1.5" />
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <p className="text-sm text-muted-foreground">זמן משוער ליישום מלא: <span className="font-bold text-foreground">42 ימים</span></p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}