import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Package, Warehouse, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, BarChart3, Target, DollarSign, Truck,
  ArrowUpRight, ArrowDownRight, RefreshCw, Search, Layers,
  Shield, Zap, Eye
} from "lucide-react";

const kpis = {
  totalSKUs: 1284,
  activeSKUs: 1048,
  totalValue: 4850000,
  turnoverRate: 8.2,
  daysOnHand: 28,
  fillRate: 96.5,
  stockoutItems: 12,
  overstockItems: 38,
  warehouseCount: 3,
  pendingReceipts: 8,
  pendingShipments: 15,
  accuracyRate: 98.2,
};

const stockAlerts = [
  { sku: "ALU-PRO-X100", name: "פרופיל אלומיניום Pro-X 100mm", warehouse: "מחסן ראשי", current: 45, reorder: 100, status: "critical", value: 30600, daysToStockout: 3 },
  { sku: "GLS-TMP-8MM", name: "זכוכית מחוסמת 8mm", warehouse: "מחסן ראשי", current: 82, reorder: 120, status: "low", value: 42640, daysToStockout: 8 },
  { sku: "BRZ-BAR-16", name: "מוט ברזל 16mm", warehouse: "מחסן צפון", current: 28, reorder: 50, status: "low", value: 8400, daysToStockout: 12 },
  { sku: "ACC-HNG-PRE", name: "ציר premium", warehouse: "מחסן ראשי", current: 180, reorder: 200, status: "warning", value: 16200, daysToStockout: 18 },
  { sku: "SLN-SIL-BLK", name: "סיליקון שחור", warehouse: "מחסן דרום", current: 12, reorder: 30, status: "critical", value: 2160, daysToStockout: 2 },
];

const warehouseOverview = [
  { name: "מחסן ראשי — חולון", code: "WH-01", capacity: 85, skus: 680, value: 3200000, pendingIn: 5, pendingOut: 8, accuracy: 98.5 },
  { name: "מחסן צפון — חיפה", code: "WH-02", capacity: 62, skus: 245, value: 1100000, pendingIn: 2, pendingOut: 4, accuracy: 97.8 },
  { name: "מחסן דרום — באר שבע", code: "WH-03", capacity: 45, skus: 123, value: 550000, pendingIn: 1, pendingOut: 3, accuracy: 98.0 },
];

const recentMovements = [
  { date: "2026-04-08 10:30", type: "in", sku: "ALU-PRO-X100", qty: 200, warehouse: "מחסן ראשי", reference: "GR-000234", by: "יוסי לוי" },
  { date: "2026-04-08 09:15", type: "out", sku: "GLS-TMP-8MM", qty: 50, warehouse: "מחסן ראשי", reference: "SO-002456", by: "מערכת" },
  { date: "2026-04-07 16:00", type: "transfer", sku: "BRZ-BAR-16", qty: 30, warehouse: "ראשי → צפון", reference: "TR-000089", by: "דוד כהן" },
  { date: "2026-04-07 14:00", type: "out", sku: "ACC-HNG-PRE", qty: 120, warehouse: "מחסן ראשי", reference: "SO-002455", by: "מערכת" },
  { date: "2026-04-07 11:00", type: "adjustment", sku: "SLN-SIL-BLK", qty: -5, warehouse: "מחסן דרום", reference: "ADJ-000012", by: "ספירת מלאי" },
];

const topItems = [
  { sku: "ALU-PRO-X100", name: "פרופיל Pro-X 100mm", onHand: 245, reserved: 80, available: 165, value: 166600, turnover: 12.5, doh: 18 },
  { sku: "GLS-TMP-8MM", name: "זכוכית מחוסמת 8mm", onHand: 132, reserved: 50, available: 82, value: 68640, turnover: 9.8, doh: 25 },
  { sku: "ALU-PRO-X60", name: "פרופיל Pro-X 60mm", onHand: 380, reserved: 120, available: 260, value: 193800, turnover: 8.2, doh: 30 },
  { sku: "BRZ-BAR-16", name: "מוט ברזל 16mm", onHand: 78, reserved: 20, available: 58, value: 23400, turnover: 15.2, doh: 12 },
  { sku: "ACC-HNG-PRE", name: "ציר premium", onHand: 380, reserved: 200, available: 180, value: 34200, turnover: 6.5, doh: 38 },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v.toLocaleString()}`;

export default function InventoryCommandCenter() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-7 w-7 text-primary" /> Inventory Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">מלאי | מחסנים | תנועות | התראות | Turnover | Fill Rate</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-8 gap-2">
        {[
          { label: "פריטים פעילים", value: `${kpis.activeSKUs}/${kpis.totalSKUs}`, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "שווי מלאי", value: fmt(kpis.totalValue), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Turnover", value: `${kpis.turnoverRate}x`, icon: RefreshCw, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Days on Hand", value: `${kpis.daysOnHand}d`, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Fill Rate", value: `${kpis.fillRate}%`, icon: Target, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Stockouts", value: String(kpis.stockoutItems), icon: AlertTriangle, color: kpis.stockoutItems > 0 ? "text-red-600" : "text-emerald-600", bg: kpis.stockoutItems > 0 ? "bg-red-50" : "bg-emerald-50" },
          { label: "Overstock", value: String(kpis.overstockItems), icon: Layers, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Accuracy", value: `${kpis.accuracyRate}%`, icon: CheckCircle, color: "text-teal-600", bg: "bg-teal-50" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="alerts">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="alerts" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> התראות ({stockAlerts.length})</TabsTrigger>
          <TabsTrigger value="warehouses" className="text-xs gap-1"><Warehouse className="h-3.5 w-3.5" /> מחסנים</TabsTrigger>
          <TabsTrigger value="movements" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" /> תנועות</TabsTrigger>
          <TabsTrigger value="items" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> פריטים מובילים</TabsTrigger>
          <TabsTrigger value="analysis" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> ניתוח ABC</TabsTrigger>
        </TabsList>

        {/* Stock Alerts */}
        <TabsContent value="alerts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">SKU</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פריט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מחסן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">קיים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מינימום</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-24">ניצול</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ימים ל-0</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שווי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockAlerts.sort((a, b) => a.daysToStockout - b.daysToStockout).map((item, i) => (
                    <TableRow key={i} className={item.status === "critical" ? "bg-red-50/30" : ""}>
                      <TableCell className="font-mono text-[10px]">{item.sku}</TableCell>
                      <TableCell className="text-xs font-medium">{item.name}</TableCell>
                      <TableCell className="text-[10px]">{item.warehouse}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{item.current}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{item.reorder}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={(item.current / item.reorder) * 100} className={`h-2 w-16 ${(item.current / item.reorder) < 0.5 ? "[&>div]:bg-red-500" : "[&>div]:bg-amber-500"}`} />
                          <span className="text-[9px] font-mono">{((item.current / item.reorder) * 100).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${item.daysToStockout <= 5 ? "text-red-600" : "text-amber-600"}`}>
                        {item.daysToStockout}d
                      </TableCell>
                      <TableCell className="font-mono text-[10px]">{fmt(item.value)}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${item.status === "critical" ? "bg-red-100 text-red-700 animate-pulse" : item.status === "low" ? "bg-amber-100 text-amber-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {item.status === "critical" ? "🚨 קריטי" : item.status === "low" ? "⚠️ נמוך" : "📉 אזהרה"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Warehouses */}
        <TabsContent value="warehouses">
          <div className="grid grid-cols-3 gap-4">
            {warehouseOverview.map((wh, i) => (
              <Card key={i} className={`${wh.capacity > 80 ? "border-amber-200" : "border-border"}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2"><Warehouse className="h-4 w-4" />{wh.name}</CardTitle>
                    <Badge variant="outline" className="font-mono text-[9px]">{wh.code}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span>ניצול קיבולת</span>
                      <span className={`font-mono font-bold ${wh.capacity > 80 ? "text-amber-600" : "text-emerald-600"}`}>{wh.capacity}%</span>
                    </div>
                    <Progress value={wh.capacity} className={`h-2 ${wh.capacity > 80 ? "[&>div]:bg-amber-500" : ""}`} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">פריטים</span><span className="font-mono">{wh.skus}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">שווי</span><span className="font-mono">{fmt(wh.value)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">ממתין כניסה</span><span className="font-mono">{wh.pendingIn}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">ממתין יציאה</span><span className="font-mono">{wh.pendingOut}</span></div>
                    <div className="flex justify-between col-span-2"><span className="text-muted-foreground">דיוק מלאי</span><span className="font-mono font-bold">{wh.accuracy}%</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Movements */}
        <TabsContent value="movements">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">SKU</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מחסן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אסמכתא</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">בוצע ע"י</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentMovements.map((mv, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[10px]">{mv.date}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${mv.type === "in" ? "bg-emerald-100 text-emerald-700" : mv.type === "out" ? "bg-red-100 text-red-700" : mv.type === "transfer" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {mv.type === "in" ? "⬇️ כניסה" : mv.type === "out" ? "⬆️ יציאה" : mv.type === "transfer" ? "↔️ העברה" : "📝 התאמה"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[10px]">{mv.sku}</TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${mv.qty > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {mv.qty > 0 ? "+" : ""}{mv.qty}
                      </TableCell>
                      <TableCell className="text-[10px]">{mv.warehouse}</TableCell>
                      <TableCell className="font-mono text-[9px] text-muted-foreground">{mv.reference}</TableCell>
                      <TableCell className="text-[10px]">{mv.by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Items */}
        <TabsContent value="items">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">SKU</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פריט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">בנמצא</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מוקצה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">זמין</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שווי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Turnover</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">DOH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItems.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-[10px]">{item.sku}</TableCell>
                      <TableCell className="text-xs font-medium">{item.name}</TableCell>
                      <TableCell className="font-mono text-xs">{item.onHand}</TableCell>
                      <TableCell className="font-mono text-[10px] text-amber-600">{item.reserved}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-600">{item.available}</TableCell>
                      <TableCell className="font-mono text-[10px]">{fmt(item.value)}</TableCell>
                      <TableCell className="font-mono text-[10px]">{item.turnover}x</TableCell>
                      <TableCell className="font-mono text-[10px]">{item.doh}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABC Analysis */}
        <TabsContent value="analysis">
          <div className="grid grid-cols-3 gap-4">
            {[
              { class: "A", label: "פריטים קריטיים", pct: 15, valuePct: 70, count: 157, value: 3395000, color: "border-red-300 bg-red-50/30", textColor: "text-red-700" },
              { class: "B", label: "פריטים חשובים", pct: 30, valuePct: 20, count: 314, value: 970000, color: "border-amber-300 bg-amber-50/30", textColor: "text-amber-700" },
              { class: "C", label: "פריטים שוטפים", pct: 55, valuePct: 10, count: 577, value: 485000, color: "border-emerald-300 bg-emerald-50/30", textColor: "text-emerald-700" },
            ].map((abc, i) => (
              <Card key={i} className={abc.color}>
                <CardContent className="pt-5 text-center">
                  <div className={`text-3xl font-bold ${abc.textColor}`}>Class {abc.class}</div>
                  <p className="text-sm text-muted-foreground mt-1">{abc.label}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-[10px]">
                    <div className="flex justify-between"><span>פריטים</span><span className="font-mono font-bold">{abc.count} ({abc.pct}%)</span></div>
                    <div className="flex justify-between"><span>שווי</span><span className="font-mono font-bold">{fmt(abc.value)} ({abc.valuePct}%)</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
