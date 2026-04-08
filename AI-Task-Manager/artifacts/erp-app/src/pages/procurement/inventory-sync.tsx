import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, AlertTriangle, CheckCircle, Clock, Package,
  ShieldCheck, ArrowDownToLine, Lock, Activity, TrendingUp
} from "lucide-react";

const API = "/api";

// ============================================================
// DATA — Inventory-Procurement Sync for טכנו-כל עוזי
// ============================================================

const FALLBACK_LOW_STOCK_ITEMS = [
  { item: "פרופיל אלומיניום 6063-T5", currentQty: 42, unit: "מ'", minLevel: 100, reorderPoint: 120, autoRequest: "נוצרה PR-000312", supplier: "Alumil SA", status: "critical" },
  { item: "זכוכית מחוסמת 10 מ\"מ", currentQty: 18, unit: "יח'", minLevel: 50, reorderPoint: 60, autoRequest: "נוצרה PR-000313", supplier: "Foshan Glass Co.", status: "critical" },
  { item: "ברגים נירוסטה M8x25", currentQty: 340, unit: "יח'", minLevel: 500, reorderPoint: 600, autoRequest: "נוצרה PR-000314", supplier: "מפעלי ברזל השרון", status: "warning" },
  { item: "אטמי EPDM 12 מ\"מ", currentQty: 85, unit: "מ'", minLevel: 200, reorderPoint: 250, autoRequest: "נוצרה PR-000315", supplier: "גומי-טק בע\"מ", status: "warning" },
  { item: "פח ברזל מגולוון 1.5 מ\"מ", currentQty: 12, unit: "גיליון", minLevel: 30, reorderPoint: 40, autoRequest: "נוצרה PR-000316", supplier: "מפעלי ברזל השרון", status: "critical" },
  { item: "סיליקון שקוף UV", currentQty: 28, unit: "שפ'", minLevel: 50, reorderPoint: 60, autoRequest: "ממתינה לאישור", supplier: "Sika Israel", status: "warning" },
  { item: "זכוכית למינציה 6+6", currentQty: 5, unit: "יח'", minLevel: 20, reorderPoint: 25, autoRequest: "נוצרה PR-000317", supplier: "Foshan Glass Co.", status: "critical" },
  { item: "פרופיל ברזל 40x40x3", currentQty: 65, unit: "מ'", minLevel: 80, reorderPoint: 100, autoRequest: "ממתינה לאישור", supplier: "מפעלי ברזל השרון", status: "warning" },
];

const FALLBACK_RESERVED_ITEMS = [
  { item: "פרופיל אלומיניום 6063-T5", project: "PRJ-1048", projectName: "מגדל אופיס פארק ת\"א", qtyReserved: 280, unit: "מ'", reservedBy: "יוסי כהן", date: "2026-04-06", releaseDate: "2026-04-20" },
  { item: "זכוכית מחוסמת 10 מ\"מ", project: "PRJ-1048", projectName: "מגדל אופיס פארק ת\"א", qtyReserved: 96, unit: "יח'", reservedBy: "יוסי כהן", date: "2026-04-06", releaseDate: "2026-04-22" },
  { item: "ברגים נירוסטה M8x25", project: "PRJ-1052", projectName: "בית ספר השלום ר\"ג", qtyReserved: 1200, unit: "יח'", reservedBy: "שרה לוי", date: "2026-04-04", releaseDate: "2026-04-15" },
  { item: "אטמי EPDM 12 מ\"מ", project: "PRJ-1050", projectName: "מרכז מסחרי כפ\"ס", qtyReserved: 350, unit: "מ'", reservedBy: "דוד מזרחי", date: "2026-04-03", releaseDate: "2026-04-18" },
  { item: "פח ברזל מגולוון 1.5 מ\"מ", project: "PRJ-1055", projectName: "שיפוץ בניין עירייה חיפה", qtyReserved: 45, unit: "גיליון", reservedBy: "רחל אברהם", date: "2026-04-07", releaseDate: "2026-04-25" },
  { item: "זכוכית למינציה 6+6", project: "PRJ-1048", projectName: "מגדל אופיס פארק ת\"א", qtyReserved: 40, unit: "יח'", reservedBy: "יוסי כהן", date: "2026-04-06", releaseDate: "2026-04-22" },
  { item: "סיליקון שקוף UV", project: "PRJ-1052", projectName: "בית ספר השלום ר\"ג", qtyReserved: 60, unit: "שפ'", reservedBy: "שרה לוי", date: "2026-04-05", releaseDate: "2026-04-16" },
];

const FALLBACK_RECEIPT_UPDATES = [
  { grn: "GRN-004520", items: "פרופיל אלומיניום 6063-T5 (150 מ')", qtyAdded: 150, warehouse: "מחסן ראשי A", updatedBy: "עומר חדד", time: "08/04/2026 09:15", status: "synced" },
  { grn: "GRN-004519", items: "ברגים נירוסטה M8x25 (2,000 יח')", qtyAdded: 2000, warehouse: "מחסן חומרי עזר", updatedBy: "מיכל ברק", time: "08/04/2026 08:40", status: "synced" },
  { grn: "GRN-004518", items: "זכוכית מחוסמת 10 מ\"מ (30 יח')", qtyAdded: 30, warehouse: "מחסן זכוכית", updatedBy: "עומר חדד", time: "07/04/2026 16:20", status: "synced" },
  { grn: "GRN-004517", items: "אטמי EPDM 12 מ\"מ (500 מ')", qtyAdded: 500, warehouse: "מחסן ראשי A", updatedBy: "נועה פרידמן", time: "07/04/2026 14:30", status: "synced" },
  { grn: "GRN-004516", items: "פח ברזל מגולוון 1.5 מ\"מ (20 גיליון)", qtyAdded: 20, warehouse: "מחסן מתכת", updatedBy: "מיכל ברק", time: "07/04/2026 11:00", status: "warning" },
  { grn: "GRN-004515", items: "סיליקון שקוף UV (100 שפ')", qtyAdded: 100, warehouse: "מחסן חומרי עזר", updatedBy: "עומר חדד", time: "06/04/2026 15:45", status: "synced" },
  { grn: "GRN-004514", items: "פרופיל ברזל 40x40x3 (80 מ')", qtyAdded: 80, warehouse: "מחסן מתכת", updatedBy: "נועה פרידמן", time: "06/04/2026 10:20", status: "synced" },
  { grn: "GRN-004513", items: "זכוכית למינציה 6+6 (15 יח')", qtyAdded: 15, warehouse: "מחסן זכוכית", updatedBy: "מיכל ברק", time: "05/04/2026 13:50", status: "error" },
];

const FALLBACK_SYNC_MODULES = [
  { module: "מלאי → רכש (Low Stock)", lastSync: "08/04/2026 09:00", status: "ok", records: 8, errors: 0, warnings: 0 },
  { module: "קבלות → מלאי (GRN)", lastSync: "08/04/2026 09:15", status: "ok", records: 52, errors: 0, warnings: 1 },
  { module: "שריון → פרויקטים", lastSync: "08/04/2026 08:30", status: "ok", records: 7, errors: 0, warnings: 0 },
  { module: "הזמנות רכש → מלאי צפוי", lastSync: "08/04/2026 07:00", status: "warning", records: 24, errors: 0, warnings: 3 },
  { module: "מחסנים → BI דוחות", lastSync: "07/04/2026 23:00", status: "ok", records: 1480, errors: 0, warnings: 0 },
  { module: "ספקים → עדכון מחירון", lastSync: "07/04/2026 20:00", status: "error", records: 0, errors: 2, warnings: 0 },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    critical: "bg-red-500/20 text-red-300",
    warning: "bg-yellow-500/20 text-yellow-300",
    synced: "bg-green-500/20 text-green-300",
    ok: "bg-green-500/20 text-green-300",
    error: "bg-red-500/20 text-red-300",
  };
  const labels: Record<string, string> = {
    critical: "קריטי",
    warning: "אזהרה",
    synced: "מסונכרן",
    ok: "תקין",
    error: "שגיאה",
  };
  return <Badge className={`${map[s] || "bg-slate-500/20 text-slate-300"} border-0 text-xs`}>{labels[s] || s}</Badge>;
};

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

// ============================================================
// COMPONENT
// ============================================================

export default function InventorySync() {
  const [activeTab, setActiveTab] = useState("low-stock");

  const { data: apiData } = useQuery({
    queryKey: ["procurement-inventory-sync"],
    queryFn: async () => {
      const res = await authFetch(`${API}/procurement/inventory-sync`);
      if (!res.ok) throw new Error("Failed to fetch inventory sync");
      return res.json();
    },
  });

  const lowStockItems = apiData?.lowStockItems ?? FALLBACK_LOW_STOCK_ITEMS;
  const reservedItems = apiData?.reservedItems ?? FALLBACK_RESERVED_ITEMS;
  const receiptUpdates = apiData?.receiptUpdates ?? FALLBACK_RECEIPT_UPDATES;
  const syncModules = apiData?.syncModules ?? FALLBACK_SYNC_MODULES;

  const kpis = [
    { label: "פריטים במלאי נמוך", value: "8", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "בקשות רכש אוטומטיות", value: "6", icon: ArrowDownToLine, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "פריטים משוריינים לפרויקטים", value: "7", icon: Lock, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "עדכוני קבלה ממתינים", value: "2", icon: Package, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "סטטוס סנכרון", value: "תקין", icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10", sub: "5/6 מודולים OK" },
    { label: "סנכרון אחרון", value: "09:15", icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10", sub: "08/04/2026" },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RefreshCw className="h-6 w-6 text-indigo-400" />
            סנכרון מלאי-רכש
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול סנכרון אוטומטי בין מלאי, רכש ופרויקטים — טכנו-כל עוזי</p>
        </div>
        <Badge className="bg-green-500/20 text-green-300 border-0 gap-1 px-3 py-1.5 text-sm">
          <Activity className="h-3.5 w-3.5" /> מערכת פעילה
        </Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  {k.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>}
                </div>
                <div className={`${k.bg} p-1.5 rounded-lg`}>
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700 p-1">
          <TabsTrigger value="low-stock" className="data-[state=active]:bg-slate-700 gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> מלאי נמוך
          </TabsTrigger>
          <TabsTrigger value="reserved" className="data-[state=active]:bg-slate-700 gap-1.5">
            <Lock className="h-3.5 w-3.5" /> שריון לפרויקטים
          </TabsTrigger>
          <TabsTrigger value="receipts" className="data-[state=active]:bg-slate-700 gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5" /> עדכוני קבלה
          </TabsTrigger>
          <TabsTrigger value="sync-status" className="data-[state=active]:bg-slate-700 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> סטטוס סנכרון
          </TabsTrigger>
        </TabsList>

        {/* Tab 1 — Low Stock */}
        <TabsContent value="low-stock">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">פריט</TableHead>
                    <TableHead className="text-center text-muted-foreground">כמות נוכחית</TableHead>
                    <TableHead className="text-center text-muted-foreground">מינימום</TableHead>
                    <TableHead className="text-center text-muted-foreground">נקודת הזמנה</TableHead>
                    <TableHead className="text-center text-muted-foreground">מצב</TableHead>
                    <TableHead className="text-center text-muted-foreground">בקשת רכש אוטומטית</TableHead>
                    <TableHead className="text-right text-muted-foreground">ספק</TableHead>
                    <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map((r, i) => {
                    const pct = Math.round((r.currentQty / r.minLevel) * 100);
                    return (
                      <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="font-medium text-foreground">{r.item}</TableCell>
                        <TableCell className="text-center font-mono text-red-400">{fmt(r.currentQty)} {r.unit}</TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{fmt(r.minLevel)}</TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{fmt(r.reorderPoint)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <Progress value={pct} className="h-2 w-16 [&>div]:bg-red-500" />
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-blue-400">{r.autoRequest}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{r.supplier}</TableCell>
                        <TableCell className="text-center">{statusBadge(r.status)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 — Reserved Items */}
        <TabsContent value="reserved">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">פריט</TableHead>
                    <TableHead className="text-right text-muted-foreground">פרויקט</TableHead>
                    <TableHead className="text-center text-muted-foreground">כמות משוריינת</TableHead>
                    <TableHead className="text-right text-muted-foreground">שוריין ע״י</TableHead>
                    <TableHead className="text-center text-muted-foreground">תאריך שריון</TableHead>
                    <TableHead className="text-center text-muted-foreground">תאריך שחרור</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservedItems.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-medium text-foreground">{r.item}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-mono text-xs text-blue-400">{r.project}</span>
                          <p className="text-sm text-muted-foreground">{r.projectName}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono text-purple-400">{fmt(r.qtyReserved)} {r.unit}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{r.reservedBy}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{r.date}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{r.releaseDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 — Receipt Updates */}
        <TabsContent value="receipts">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">GRN</TableHead>
                    <TableHead className="text-right text-muted-foreground">פריטים</TableHead>
                    <TableHead className="text-center text-muted-foreground">כמות שנוספה</TableHead>
                    <TableHead className="text-right text-muted-foreground">מחסן</TableHead>
                    <TableHead className="text-right text-muted-foreground">עודכן ע״י</TableHead>
                    <TableHead className="text-center text-muted-foreground">זמן</TableHead>
                    <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receiptUpdates.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-mono text-xs text-blue-400">{r.grn}</TableCell>
                      <TableCell className="text-sm text-foreground">{r.items}</TableCell>
                      <TableCell className="text-center font-mono text-green-400">+{fmt(r.qtyAdded)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.warehouse}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.updatedBy}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{r.time}</TableCell>
                      <TableCell className="text-center">{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 — Sync Status */}
        <TabsContent value="sync-status">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">מודול</TableHead>
                    <TableHead className="text-center text-muted-foreground">סנכרון אחרון</TableHead>
                    <TableHead className="text-center text-muted-foreground">רשומות</TableHead>
                    <TableHead className="text-center text-muted-foreground">שגיאות</TableHead>
                    <TableHead className="text-center text-muted-foreground">אזהרות</TableHead>
                    <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncModules.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-medium text-foreground">{r.module}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground font-mono">{r.lastSync}</TableCell>
                      <TableCell className="text-center font-mono text-cyan-400">{fmt(r.records)}</TableCell>
                      <TableCell className="text-center font-mono">
                        <span className={r.errors > 0 ? "text-red-400" : "text-muted-foreground"}>{r.errors}</span>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        <span className={r.warnings > 0 ? "text-yellow-400" : "text-muted-foreground"}>{r.warnings}</span>
                      </TableCell>
                      <TableCell className="text-center">{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Sync summary footer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-300">5 מודולים תקינים</p>
                  <p className="text-xs text-muted-foreground">סנכרון עובד כרגיל</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-500/5 border-yellow-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <div>
                  <p className="text-sm font-medium text-yellow-300">3 אזהרות פתוחות</p>
                  <p className="text-xs text-muted-foreground">הזמנות רכש → מלאי צפוי</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">2 שגיאות — עדכון מחירון ספקים</p>
                  <p className="text-xs text-muted-foreground">נדרשת בדיקה ידנית</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}