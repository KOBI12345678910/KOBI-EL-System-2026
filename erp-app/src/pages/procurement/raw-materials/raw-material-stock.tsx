import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Warehouse, Package, AlertTriangle, TrendingUp, TrendingDown,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ShoppingCart,
  Calendar, BarChart3, Ban, Lock, CheckCircle
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");

const FALLBACK_STOCK_DATA = [
  { id: "RM-001", material: "פרופיל אלומיניום 6063-T5", warehouse: "מחסן ראשי A", onHand: 820, allocated: 280, available: 540, min: 200, reorderPoint: 350, unit: "מ'", unitCost: 48, status: "תקין" },
  { id: "RM-002", material: "זכוכית מחוסמת 10 מ\"מ", warehouse: "מחסן זכוכית", onHand: 145, allocated: 96, available: 49, min: 50, reorderPoint: 80, unit: "יח'", unitCost: 320, status: "נמוך" },
  { id: "RM-003", material: "ברגים נירוסטה M8x25", warehouse: "מחסן חומרי עזר", onHand: 4200, allocated: 1200, available: 3000, min: 1000, reorderPoint: 2000, unit: "יח'", unitCost: 1.2, status: "תקין" },
  { id: "RM-004", material: "אטמי EPDM 12 מ\"מ", warehouse: "מחסן ראשי A", onHand: 185, allocated: 350, available: 0, min: 200, reorderPoint: 300, unit: "מ'", unitCost: 8.5, status: "חסר" },
  { id: "RM-005", material: "פח ברזל מגולוון 1.5 מ\"מ", warehouse: "מחסן מתכות", onHand: 62, allocated: 45, available: 17, min: 30, reorderPoint: 50, unit: "גיליון", unitCost: 185, status: "נמוך" },
  { id: "RM-006", material: "סיליקון שקוף UV", warehouse: "מחסן חומרי עזר", onHand: 88, allocated: 60, available: 28, min: 50, reorderPoint: 70, unit: "שפ'", unitCost: 42, status: "נמוך" },
  { id: "RM-007", material: "זכוכית למינציה 6+6", warehouse: "מחסן זכוכית", onHand: 0, allocated: 40, available: 0, min: 20, reorderPoint: 30, unit: "יח'", unitCost: 580, status: "אזל" },
  { id: "RM-008", material: "פרופיל ברזל 40x40x3", warehouse: "מחסן מתכות", onHand: 310, allocated: 65, available: 245, min: 80, reorderPoint: 150, unit: "מ'", unitCost: 35, status: "תקין" },
  { id: "RM-009", material: "צבע אפוקסי תעשייתי", warehouse: "מחסן צבעים", onHand: 45, allocated: 20, available: 25, min: 30, reorderPoint: 50, unit: "ליטר", unitCost: 95, status: "נמוך" },
  { id: "RM-010", material: "לוח פוליקרבונט 16 מ\"מ", warehouse: "מחסן ראשי A", onHand: 120, allocated: 30, available: 90, min: 40, reorderPoint: 60, unit: "יח'", unitCost: 210, status: "תקין" },
  { id: "RM-011", material: "ידיות אלומיניום 200 מ\"מ", warehouse: "מחסן חומרי עזר", onHand: 0, allocated: 150, available: 0, min: 100, reorderPoint: 200, unit: "יח'", unitCost: 28, status: "אזל" },
  { id: "RM-012", material: "גומי איטום NEOPRENE", warehouse: "מחסן ראשי A", onHand: 520, allocated: 180, available: 340, min: 150, reorderPoint: 250, unit: "מ'", unitCost: 12, status: "תקין" },
];

const FALLBACK_MOVEMENTS = [
  { date: "08/04/2026", material: "פרופיל אלומיניום 6063-T5", type: "כניסה", qty: 150, fromWH: "ספק - Alumil SA", toWH: "מחסן ראשי A", ref: "GRN-004520", user: "עומר חדד" },
  { date: "08/04/2026", material: "ברגים נירוסטה M8x25", type: "כניסה", qty: 2000, fromWH: "ספק - מפעלי ברזל השרון", toWH: "מחסן חומרי עזר", ref: "GRN-004519", user: "מיכל ברק" },
  { date: "07/04/2026", material: "זכוכית מחוסמת 10 מ\"מ", type: "יציאה", qty: 30, fromWH: "מחסן זכוכית", toWH: "קו ייצור 1", ref: "WO-2280", user: "יוסי כהן" },
  { date: "07/04/2026", material: "אטמי EPDM 12 מ\"מ", type: "העברה", qty: 100, fromWH: "מחסן ראשי A", toWH: "מחסן קו 2", ref: "TRF-0891", user: "שרה לוי" },
  { date: "06/04/2026", material: "פח ברזל מגולוון 1.5 מ\"מ", type: "יציאה", qty: 15, fromWH: "מחסן מתכות", toWH: "קו ייצור 3", ref: "WO-2278", user: "דוד מזרחי" },
  { date: "06/04/2026", material: "סיליקון שקוף UV", type: "כניסה", qty: 40, fromWH: "ספק - Sika Israel", toWH: "מחסן חומרי עזר", ref: "GRN-004517", user: "עומר חדד" },
  { date: "05/04/2026", material: "צבע אפוקסי תעשייתי", type: "יציאה", qty: 12, fromWH: "מחסן צבעים", toWH: "תחנת ציפוי", ref: "WO-2275", user: "רחל אברהם" },
  { date: "05/04/2026", material: "לוח פוליקרבונט 16 מ\"מ", type: "העברה", qty: 20, fromWH: "מחסן ראשי A", toWH: "מחסן שטח PRJ-1048", ref: "TRF-0890", user: "אלון גולדשטיין" },
  { date: "04/04/2026", material: "פרופיל ברזל 40x40x3", type: "כניסה", qty: 200, fromWH: "ספק - מפעלי ברזל השרון", toWH: "מחסן מתכות", ref: "GRN-004515", user: "מיכל ברק" },
  { date: "04/04/2026", material: "גומי איטום NEOPRENE", type: "יציאה", qty: 80, fromWH: "מחסן ראשי A", toWH: "קו ייצור 2", ref: "WO-2273", user: "נועה פרידמן" },
  { date: "03/04/2026", material: "ידיות אלומיניום 200 מ\"מ", type: "יציאה", qty: 150, fromWH: "מחסן חומרי עזר", toWH: "קו הרכבה", ref: "WO-2271", user: "שרה לוי" },
  { date: "03/04/2026", material: "זכוכית למינציה 6+6", type: "יציאה", qty: 25, fromWH: "מחסן זכוכית", toWH: "קו ייצור 1", ref: "WO-2270", user: "יוסי כהן" },
];

const FALLBACK_OPEN_POS = [
  { po: "PO-003412", material: "זכוכית למינציה 6+6", supplier: "Foshan Glass Co.", qty: 50, unit: "יח'", value: 29000, expectedDate: "15/04/2026", status: "בדרך" },
  { po: "PO-003415", material: "אטמי EPDM 12 מ\"מ", supplier: "גומי-טק בע\"מ", qty: 500, unit: "מ'", value: 4250, expectedDate: "12/04/2026", status: "אושרה" },
  { po: "PO-003418", material: "ידיות אלומיניום 200 מ\"מ", supplier: "ידית-טק בע\"מ", qty: 400, unit: "יח'", value: 11200, expectedDate: "18/04/2026", status: "בדרך" },
  { po: "PO-003420", material: "צבע אפוקסי תעשייתי", supplier: "טמבור תעשייה", qty: 60, unit: "ליטר", value: 5700, expectedDate: "10/04/2026", status: "אושרה" },
  { po: "PO-003422", material: "סיליקון שקוף UV", supplier: "Sika Israel", qty: 80, unit: "שפ'", value: 3360, expectedDate: "14/04/2026", status: "ממתינה" },
  { po: "PO-003425", material: "פרופיל אלומיניום 6063-T5", supplier: "Alumil SA", qty: 300, unit: "מ'", value: 14400, expectedDate: "20/04/2026", status: "ממתינה" },
  { po: "PO-003427", material: "זכוכית מחוסמת 10 מ\"מ", supplier: "Foshan Glass Co.", qty: 80, unit: "יח'", value: 25600, expectedDate: "22/04/2026", status: "אושרה" },
  { po: "PO-003430", material: "פח ברזל מגולוון 1.5 מ\"מ", supplier: "מפעלי ברזל השרון", qty: 50, unit: "גיליון", value: 9250, expectedDate: "11/04/2026", status: "בדרך" },
  { po: "PO-003432", material: "לוח פוליקרבונט 16 מ\"מ", supplier: "פלסטיק-טק בע\"מ", qty: 40, unit: "יח'", value: 8400, expectedDate: "16/04/2026", status: "אושרה" },
  { po: "PO-003435", material: "גומי איטום NEOPRENE", supplier: "גומי-טק בע\"מ", qty: 300, unit: "מ'", value: 3600, expectedDate: "13/04/2026", status: "ממתינה" },
];

const FALLBACK_HISTORY_DATA = [
  { month: "אוקטובר 2025", totalItems: 9800, totalValue: 412000, received: 3200, issued: 2900, adjustments: -45 },
  { month: "נובמבר 2025", totalItems: 10100, totalValue: 428000, received: 3500, issued: 3100, adjustments: -55 },
  { month: "דצמבר 2025", totalItems: 10450, totalValue: 445000, received: 2800, issued: 2350, adjustments: -100 },
  { month: "ינואר 2026", totalItems: 10800, totalValue: 461000, received: 3600, issued: 3100, adjustments: -150 },
  { month: "פברואר 2026", totalItems: 11150, totalValue: 478000, received: 3800, issued: 3300, adjustments: -150 },
  { month: "מרץ 2026", totalItems: 11500, totalValue: 495000, received: 4100, issued: 3600, adjustments: -150 },
  { month: "אפריל 2026", totalItems: 11850, totalValue: 510000, received: 2400, issued: 1900, adjustments: -50 },
];

const SC: Record<string, string> = {
  "תקין": "bg-green-500/20 text-green-300",
  "נמוך": "bg-yellow-500/20 text-yellow-300",
  "חסר": "bg-orange-500/20 text-orange-300",
  "אזל": "bg-red-500/20 text-red-300",
};

const TC: Record<string, string> = {
  "כניסה": "bg-green-500/20 text-green-300",
  "יציאה": "bg-blue-500/20 text-blue-300",
  "העברה": "bg-purple-500/20 text-purple-300",
};

const PC: Record<string, string> = {
  "בדרך": "bg-blue-500/20 text-blue-300",
  "אושרה": "bg-green-500/20 text-green-300",
  "ממתינה": "bg-yellow-500/20 text-yellow-300",
};

export default function RawMaterialStock() {
  const { data: rawmaterialstockData } = useQuery({
    queryKey: ["raw-material-stock"],
    queryFn: () => authFetch("/api/procurement/raw_material_stock"),
    staleTime: 5 * 60 * 1000,
  });

  const stockData = rawmaterialstockData ?? FALLBACK_STOCK_DATA;
  const historyData = FALLBACK_HISTORY_DATA;
  const movements = FALLBACK_MOVEMENTS;
  const openPOs = FALLBACK_OPEN_POS;

  const [tab, setTab] = useState("stock");

  const totalItems = stockData.reduce((s, r) => s + r.onHand, 0);
  const totalValue = stockData.reduce((s, r) => s + r.onHand * r.unitCost, 0);
  const lowStock = stockData.filter(r => r.status === "נמוך").length;
  const outOfStock = stockData.filter(r => r.status === "אזל" || r.status === "חסר").length;
  const reserved = stockData.reduce((s, r) => s + r.allocated, 0);
  const available = stockData.reduce((s, r) => s + r.available, 0);

  const kpis = [
    { label: "סה\"כ פריטים", value: totalItems.toLocaleString("he-IL"), icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "שווי מלאי", value: fmt(totalValue), icon: BarChart3, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "מלאי נמוך", value: lowStock.toString(), icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "אזל מהמלאי", value: outOfStock.toString(), icon: Ban, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "מוקצה", value: reserved.toLocaleString("he-IL"), icon: Lock, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "זמין", value: available.toLocaleString("he-IL"), icon: CheckCircle, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ];

  const stockPct = (row: typeof stockData[0]) => {
    if (row.onHand === 0) return 0;
    return Math.min(100, Math.round((row.onHand / (row.reorderPoint * 1.5)) * 100));
  };
  const stockBarColor = (row: typeof stockData[0]) => {
    if (row.status === "אזל" || row.status === "חסר") return "bg-red-500";
    if (row.status === "נמוך") return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-blue-400" />
            מלאי חומרי גלם
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול ומעקב מלאי חומרי גלם — טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-card/80 border border-border p-1">
          <TabsTrigger value="stock" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1">
            <Package className="h-4 w-4" />מצב מלאי
          </TabsTrigger>
          <TabsTrigger value="movements" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1">
            <ArrowLeftRight className="h-4 w-4" />תנועות
          </TabsTrigger>
          <TabsTrigger value="openPOs" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1">
            <ShoppingCart className="h-4 w-4" />הזמנות פתוחות
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1">
            <Calendar className="h-4 w-4" />היסטוריה
          </TabsTrigger>
        </TabsList>

        {/* ===== Stock Levels ===== */}
        <TabsContent value="stock">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right text-muted-foreground">חומר גלם</TableHead>
                    <TableHead className="text-right text-muted-foreground">מחסן</TableHead>
                    <TableHead className="text-center text-muted-foreground">במלאי</TableHead>
                    <TableHead className="text-center text-muted-foreground">מוקצה</TableHead>
                    <TableHead className="text-center text-muted-foreground">זמין</TableHead>
                    <TableHead className="text-center text-muted-foreground">מינימום</TableHead>
                    <TableHead className="text-center text-muted-foreground">נק' הזמנה</TableHead>
                    <TableHead className="text-center text-muted-foreground w-[160px]">רמת מלאי</TableHead>
                    <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockData.map((row) => (
                    <TableRow key={row.id} className="border-border/50 hover:bg-muted/30">
                      <TableCell>
                        <div className="font-medium text-foreground text-sm">{row.material}</div>
                        <span className="text-[10px] text-muted-foreground font-mono">{row.id}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{row.warehouse}</TableCell>
                      <TableCell className="text-center font-mono text-cyan-400">{row.onHand.toLocaleString()} {row.unit}</TableCell>
                      <TableCell className="text-center font-mono text-purple-400">{row.allocated.toLocaleString()}</TableCell>
                      <TableCell className="text-center font-mono text-emerald-400">{row.available.toLocaleString()}</TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">{row.min.toLocaleString()}</TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">{row.reorderPoint.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${stockBarColor(row)}`} style={{ width: `${stockPct(row)}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono w-8 text-left">{stockPct(row)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${SC[row.status]} border-0 text-xs`}>{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Movements ===== */}
        <TabsContent value="movements">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right text-muted-foreground">תאריך</TableHead>
                    <TableHead className="text-right text-muted-foreground">חומר גלם</TableHead>
                    <TableHead className="text-center text-muted-foreground">סוג</TableHead>
                    <TableHead className="text-center text-muted-foreground">כמות</TableHead>
                    <TableHead className="text-right text-muted-foreground">ממקום</TableHead>
                    <TableHead className="text-right text-muted-foreground">למקום</TableHead>
                    <TableHead className="text-center text-muted-foreground">הפניה</TableHead>
                    <TableHead className="text-right text-muted-foreground">מבצע</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((row, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="text-muted-foreground text-xs font-mono">{row.date}</TableCell>
                      <TableCell className="font-medium text-foreground text-sm">{row.material}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${TC[row.type]} border-0 text-xs gap-1`}>
                          {row.type === "כניסה" && <ArrowDownToLine className="h-3 w-3" />}
                          {row.type === "יציאה" && <ArrowUpFromLine className="h-3 w-3" />}
                          {row.type === "העברה" && <ArrowLeftRight className="h-3 w-3" />}
                          {row.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono text-cyan-400">{row.qty.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{row.fromWH}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{row.toWH}</TableCell>
                      <TableCell className="text-center font-mono text-blue-400 text-xs">{row.ref}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{row.user}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Open POs ===== */}
        <TabsContent value="openPOs">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right text-muted-foreground">מס' הזמנה</TableHead>
                    <TableHead className="text-right text-muted-foreground">חומר גלם</TableHead>
                    <TableHead className="text-right text-muted-foreground">ספק</TableHead>
                    <TableHead className="text-center text-muted-foreground">כמות</TableHead>
                    <TableHead className="text-center text-muted-foreground">שווי</TableHead>
                    <TableHead className="text-center text-muted-foreground">צפי הגעה</TableHead>
                    <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openPOs.map((row, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-blue-400 text-xs">{row.po}</TableCell>
                      <TableCell className="font-medium text-foreground text-sm">{row.material}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-center font-mono text-cyan-400">{row.qty.toLocaleString()} {row.unit}</TableCell>
                      <TableCell className="text-center font-mono text-emerald-400">{fmt(row.value)}</TableCell>
                      <TableCell className="text-center text-muted-foreground text-xs font-mono">{row.expectedDate}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${PC[row.status]} border-0 text-xs`}>{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== History ===== */}
        <TabsContent value="history">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right text-muted-foreground">חודש</TableHead>
                    <TableHead className="text-center text-muted-foreground">סה\"כ פריטים</TableHead>
                    <TableHead className="text-center text-muted-foreground">שווי מלאי</TableHead>
                    <TableHead className="text-center text-muted-foreground">קבלות</TableHead>
                    <TableHead className="text-center text-muted-foreground">ניפוקים</TableHead>
                    <TableHead className="text-center text-muted-foreground">התאמות</TableHead>
                    <TableHead className="text-center text-muted-foreground w-[180px]">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map((row, i) => {
                    const prev = i > 0 ? historyData[i - 1] : null;
                    const valueDiff = prev ? ((row.totalValue - prev.totalValue) / prev.totalValue * 100).toFixed(1) : null;
                    const barPct = Math.round((row.totalValue / 520000) * 100);
                    return (
                      <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground text-sm">{row.month}</TableCell>
                        <TableCell className="text-center font-mono text-cyan-400">{row.totalItems.toLocaleString()}</TableCell>
                        <TableCell className="text-center font-mono text-emerald-400">{fmt(row.totalValue)}</TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-green-400">+{row.received.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-blue-400">-{row.issued.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-red-400">{row.adjustments.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${barPct}%` }} />
                            </div>
                            {valueDiff !== null && (
                              <div className="flex items-center gap-0.5">
                                {Number(valueDiff) >= 0
                                  ? <TrendingUp className="h-3 w-3 text-green-400" />
                                  : <TrendingDown className="h-3 w-3 text-red-400" />}
                                <span className={`text-[10px] font-mono ${Number(valueDiff) >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {valueDiff}%
                                </span>
                              </div>
                            )}
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
      </Tabs>
    </div>
  );
}
