import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Package, Search, AlertTriangle, CheckCircle, XCircle,
  TrendingUp, DollarSign, RefreshCw, ArrowUpDown, Layers,
  Filter, Download, BarChart3
} from "lucide-react";

const API = "/api";

type Category = "חומרי גלם" | "מוצר מוגמר" | "מתכלים" | "אביזרים";
type Status = "פעיל" | "מלאי נמוך" | "אזל" | "עודף";

interface StockItem {
  sku: string;
  name: string;
  category: Category;
  warehouse: string;
  zoneBin: string;
  unit: string;
  onHand: number;
  allocated: number;
  available: number;
  min: number;
  max: number;
  reorderPoint: number;
  value: number;
  lastMovement: string;
  status: Status;
}

const FALLBACK_STOCK_ITEMS: StockItem[] = [
  { sku: "RM-ALU-100", name: "פרופיל אלומיניום 100mm", category: "חומרי גלם", warehouse: "מחסן ראשי", zoneBin: "A-01-03", unit: "מטר", onHand: 1240, allocated: 380, available: 860, min: 200, max: 3000, reorderPoint: 500, value: 186000, lastMovement: "2026-04-08", status: "פעיל" },
  { sku: "RM-STL-016", name: "מוט פלדה 16mm", category: "חומרי גלם", warehouse: "מחסן ראשי", zoneBin: "A-02-01", unit: "מטר", onHand: 48, allocated: 20, available: 28, min: 50, max: 500, reorderPoint: 80, value: 14400, lastMovement: "2026-04-07", status: "מלאי נמוך" },
  { sku: "RM-GLS-008", name: "זכוכית מחוסמת 8mm", category: "חומרי גלם", warehouse: "מחסן ראשי", zoneBin: "B-01-02", unit: "מ״ר", onHand: 320, allocated: 150, available: 170, min: 100, max: 800, reorderPoint: 200, value: 128000, lastMovement: "2026-04-08", status: "פעיל" },
  { sku: "RM-PNT-WHT", name: "צבע אפוקסי לבן 20L", category: "חומרי גלם", warehouse: "מחסן דרום", zoneBin: "C-03-01", unit: "דלי", onHand: 0, allocated: 0, available: 0, min: 10, max: 60, reorderPoint: 15, value: 0, lastMovement: "2026-03-28", status: "אזל" },
  { sku: "FG-WIN-SLD", name: "חלון הזזה 120x150", category: "מוצר מוגמר", warehouse: "מחסן ראשי", zoneBin: "D-01-01", unit: "יחידה", onHand: 85, allocated: 30, available: 55, min: 20, max: 200, reorderPoint: 40, value: 212500, lastMovement: "2026-04-07", status: "פעיל" },
  { sku: "FG-DOR-SEC", name: "דלת בטחון מדגם X7", category: "מוצר מוגמר", warehouse: "מחסן צפון", zoneBin: "D-02-03", unit: "יחידה", onHand: 22, allocated: 18, available: 4, min: 10, max: 80, reorderPoint: 15, value: 110000, lastMovement: "2026-04-06", status: "מלאי נמוך" },
  { sku: "FG-PRT-ALU", name: "מחיצת אלומיניום משרדית", category: "מוצר מוגמר", warehouse: "מחסן ראשי", zoneBin: "D-01-05", unit: "יחידה", onHand: 250, allocated: 40, available: 210, min: 30, max: 150, reorderPoint: 50, value: 325000, lastMovement: "2026-04-08", status: "עודף" },
  { sku: "CN-WLD-ROD", name: "אלקטרודות ריתוך 3.2mm", category: "מתכלים", warehouse: "מחסן ראשי", zoneBin: "E-01-01", unit: "ק״ג", onHand: 120, allocated: 0, available: 120, min: 50, max: 300, reorderPoint: 80, value: 7200, lastMovement: "2026-04-05", status: "פעיל" },
  { sku: "CN-SND-120", name: "נייר ליטוש גריט 120", category: "מתכלים", warehouse: "מחסן דרום", zoneBin: "E-02-03", unit: "גיליון", onHand: 15, allocated: 5, available: 10, min: 50, max: 500, reorderPoint: 80, value: 450, lastMovement: "2026-04-04", status: "מלאי נמוך" },
  { sku: "CN-DRL-008", name: "מקדח HSS 8mm", category: "מתכלים", warehouse: "מחסן ראשי", zoneBin: "E-01-04", unit: "יחידה", onHand: 0, allocated: 0, available: 0, min: 20, max: 200, reorderPoint: 40, value: 0, lastMovement: "2026-03-30", status: "אזל" },
  { sku: "AC-HNG-PRE", name: "ציר Premium כבד", category: "אביזרים", warehouse: "מחסן ראשי", zoneBin: "F-01-02", unit: "יחידה", onHand: 640, allocated: 200, available: 440, min: 100, max: 800, reorderPoint: 250, value: 57600, lastMovement: "2026-04-08", status: "פעיל" },
  { sku: "AC-LCK-CYL", name: "מנעול צילינדר רב-בריח", category: "אביזרים", warehouse: "מחסן צפון", zoneBin: "F-02-01", unit: "יחידה", onHand: 38, allocated: 12, available: 26, min: 40, max: 300, reorderPoint: 60, value: 15200, lastMovement: "2026-04-06", status: "מלאי נמוך" },
  { sku: "AC-SLN-BLK", name: "סיליקון שחור 280ml", category: "אביזרים", warehouse: "מחסן דרום", zoneBin: "F-03-02", unit: "שפופרת", onHand: 0, allocated: 0, available: 0, min: 30, max: 200, reorderPoint: 50, value: 0, lastMovement: "2026-03-25", status: "אזל" },
  { sku: "RM-RBR-STP", name: "רצועת גומי איטום 5mm", category: "חומרי גלם", warehouse: "מחסן ראשי", zoneBin: "A-03-02", unit: "מטר", onHand: 2800, allocated: 200, available: 2600, min: 500, max: 2000, reorderPoint: 800, value: 22400, lastMovement: "2026-04-08", status: "עודף" },
  { sku: "FG-FRM-THR", name: "מסגרת תרמית 70mm", category: "מוצר מוגמר", warehouse: "מחסן ראשי", zoneBin: "D-01-08", unit: "יחידה", onHand: 62, allocated: 25, available: 37, min: 15, max: 120, reorderPoint: 30, value: 148800, lastMovement: "2026-04-07", status: "פעיל" },
];

const fmt = (v: number) =>
  v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v.toLocaleString()}`;

const statusBadge = (s: Status) => {
  switch (s) {
    case "פעיל": return <Badge className="bg-emerald-900/50 text-emerald-300 border-emerald-700"><CheckCircle className="h-3 w-3 mr-1" />{s}</Badge>;
    case "מלאי נמוך": return <Badge className="bg-amber-900/50 text-amber-300 border-amber-700"><AlertTriangle className="h-3 w-3 mr-1" />{s}</Badge>;
    case "אזל": return <Badge className="bg-red-900/50 text-red-300 border-red-700"><XCircle className="h-3 w-3 mr-1" />{s}</Badge>;
    case "עודף": return <Badge className="bg-purple-900/50 text-purple-300 border-purple-700"><ArrowUpDown className="h-3 w-3 mr-1" />{s}</Badge>;
  }
};

const stockLevel = (onHand: number, min: number, max: number) => {
  const pct = max > 0 ? Math.min(100, (onHand / max) * 100) : 0;
  const color = onHand === 0 ? "bg-red-500" : onHand <= min ? "bg-amber-500" : onHand > max ? "bg-purple-500" : "bg-emerald-500";
  return (
    <div className="w-20">
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default function StockItemsManagement() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const { data: apiData } = useQuery({
    queryKey: ["inventory-stock-items"],
    queryFn: async () => {
      const res = await authFetch(`${API}/inventory/items`);
      if (!res.ok) throw new Error("Failed to fetch stock items");
      return res.json();
    },
  });

  const stockItems: StockItem[] = apiData?.items ?? FALLBACK_STOCK_ITEMS;

  const filtered = stockItems.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch = !q || item.sku.toLowerCase().includes(q) || item.name.includes(q) || item.warehouse.includes(q);
    if (!matchSearch) return false;
    switch (tab) {
      case "raw": return item.category === "חומרי גלם";
      case "finished": return item.category === "מוצר מוגמר";
      case "consumables": return item.category === "מתכלים";
      case "exceptions": return item.status === "מלאי נמוך" || item.status === "אזל" || item.status === "עודף";
      default: return true;
    }
  });

  const totalSKUs = stockItems.length;
  const activeSKUs = stockItems.filter((i) => i.status === "פעיל").length;
  const lowStock = stockItems.filter((i) => i.status === "מלאי נמוך").length;
  const outOfStock = stockItems.filter((i) => i.status === "אזל").length;
  const totalValue = stockItems.reduce((s, i) => s + i.value, 0);
  const avgTurnover = 24;

  const kpis = [
    { label: "סה״כ SKUs", value: totalSKUs.toString(), icon: Package, color: "text-blue-400", bg: "bg-blue-950/40" },
    { label: "פעילים", value: activeSKUs.toString(), icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-950/40" },
    { label: "מלאי נמוך", value: lowStock.toString(), icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-950/40" },
    { label: "אזל מהמלאי", value: outOfStock.toString(), icon: XCircle, color: "text-red-400", bg: "bg-red-950/40" },
    { label: "שווי מלאי", value: fmt(totalValue), icon: DollarSign, color: "text-cyan-400", bg: "bg-cyan-950/40" },
    { label: "מחזור ממוצע (ימים)", value: avgTurnover.toString(), icon: RefreshCw, color: "text-purple-400", bg: "bg-purple-950/40" },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-7 w-7 text-blue-400" />
            ניהול פריטי מלאי
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            טכנו-כל עוזי | ניהול מלאי מרכזי | SKU | מחסנים | ערכים | התראות
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש SKU, שם, מחסן..."
              className="pr-9 pl-3 py-2 text-sm rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button className="flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <Filter className="h-4 w-4" /> סינון
          </button>
          <button className="flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <Download className="h-4 w-4" /> ייצוא
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-zinc-800 bg-zinc-900/70">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${kpi.bg}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + Table */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="all" className="data-[state=active]:bg-zinc-700">כל הפריטים</TabsTrigger>
          <TabsTrigger value="raw" className="data-[state=active]:bg-zinc-700">חומרי גלם</TabsTrigger>
          <TabsTrigger value="finished" className="data-[state=active]:bg-zinc-700">מוצרים</TabsTrigger>
          <TabsTrigger value="consumables" className="data-[state=active]:bg-zinc-700">מתכלים</TabsTrigger>
          <TabsTrigger value="exceptions" className="data-[state=active]:bg-zinc-700">
            חריגים
            {(lowStock + outOfStock + stockItems.filter((i) => i.status === "עודף").length) > 0 && (
              <Badge variant="destructive" className="mr-1 text-[10px] px-1.5 py-0">
                {lowStock + outOfStock + stockItems.filter((i) => i.status === "עודף").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          <Card className="border-zinc-800 bg-zinc-900/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-400" />
                {tab === "all" ? "כל פריטי המלאי" : tab === "raw" ? "חומרי גלם" : tab === "finished" ? "מוצרים מוגמרים" : tab === "consumables" ? "מתכלים" : "פריטים חריגים"} — {filtered.length} פריטים
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-right text-zinc-400 text-xs">SKU</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">שם פריט</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">קטגוריה</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">מחסן</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">אזור/תא</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">יח׳</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">במלאי</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">מוקצה</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">זמין</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">מינ׳</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">מקס׳</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">נק׳ הזמנה</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">שווי ₪</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">תנועה אחרונה</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">רמה</TableHead>
                      <TableHead className="text-right text-zinc-400 text-xs">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.sku} className="border-zinc-800 hover:bg-zinc-800/50 text-sm">
                        <TableCell className="font-mono text-xs text-blue-400">{item.sku}</TableCell>
                        <TableCell className="font-medium text-zinc-100">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-zinc-300 text-xs">{item.warehouse}</TableCell>
                        <TableCell className="font-mono text-xs text-zinc-400">{item.zoneBin}</TableCell>
                        <TableCell className="text-zinc-400 text-xs">{item.unit}</TableCell>
                        <TableCell className="text-zinc-100 font-semibold">{item.onHand.toLocaleString()}</TableCell>
                        <TableCell className="text-zinc-400">{item.allocated.toLocaleString()}</TableCell>
                        <TableCell className={`font-semibold ${item.available === 0 ? "text-red-400" : item.available < item.min ? "text-amber-400" : "text-emerald-400"}`}>
                          {item.available.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-zinc-500 text-xs">{item.min}</TableCell>
                        <TableCell className="text-zinc-500 text-xs">{item.max}</TableCell>
                        <TableCell className="text-zinc-500 text-xs">{item.reorderPoint}</TableCell>
                        <TableCell className="text-cyan-400 font-medium">{fmt(item.value)}</TableCell>
                        <TableCell className="text-zinc-500 text-xs">{item.lastMovement}</TableCell>
                        <TableCell>{stockLevel(item.onHand, item.min, item.max)}</TableCell>
                        <TableCell>{statusBadge(item.status)}</TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={16} className="text-center py-12 text-zinc-500">
                          לא נמצאו פריטים
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Summary Footer */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-blue-400" />
              <p className="text-xs font-medium text-zinc-400">התפלגות לפי קטגוריה</p>
            </div>
            {(["חומרי גלם", "מוצר מוגמר", "מתכלים", "אביזרים"] as Category[]).map((cat) => {
              const count = stockItems.filter((i) => i.category === cat).length;
              const pct = (count / stockItems.length) * 100;
              return (
                <div key={cat} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-zinc-400 w-20 truncate">{cat}</span>
                  <Progress value={pct} className="h-2 flex-1" />
                  <span className="text-xs text-zinc-500 w-6 text-left">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <p className="text-xs font-medium text-zinc-400">שווי לפי מחסן</p>
            </div>
            {["מחסן ראשי", "מחסן צפון", "מחסן דרום"].map((wh) => {
              const val = stockItems.filter((i) => i.warehouse === wh).reduce((s, i) => s + i.value, 0);
              const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
              return (
                <div key={wh} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-zinc-400 w-20 truncate">{wh}</span>
                  <Progress value={pct} className="h-2 flex-1" />
                  <span className="text-xs text-cyan-400 w-14 text-left">{fmt(val)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <p className="text-xs font-medium text-zinc-400">התראות פעילות</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">מלאי נמוך</span>
                <Badge className="bg-amber-900/50 text-amber-300 border-amber-700">{lowStock}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">אזל מהמלאי</span>
                <Badge className="bg-red-900/50 text-red-300 border-red-700">{outOfStock}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">עודף מלאי</span>
                <Badge className="bg-purple-900/50 text-purple-300 border-purple-700">{stockItems.filter((i) => i.status === "עודף").length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">דורשים הזמנה</span>
                <Badge className="bg-blue-900/50 text-blue-300 border-blue-700">{stockItems.filter((i) => i.onHand <= i.reorderPoint && i.onHand > 0).length}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-cyan-400" />
              <p className="text-xs font-medium text-zinc-400">סיכום ערכי</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">שווי כולל</span>
                <span className="text-sm font-bold text-cyan-400">{fmt(totalValue)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">ממוצע לפריט</span>
                <span className="text-sm font-bold text-zinc-200">{fmt(Math.round(totalValue / totalSKUs))}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">פריט יקר ביותר</span>
                <span className="text-xs text-zinc-300">{stockItems.reduce((a, b) => a.value > b.value ? a : b).name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">מחזור ממוצע</span>
                <span className="text-sm font-bold text-purple-400">{avgTurnover} ימים</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}