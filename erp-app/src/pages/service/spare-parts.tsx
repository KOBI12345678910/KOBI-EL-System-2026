import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Package, AlertTriangle, TrendingUp, TrendingDown, ShoppingCart,
  Boxes, BarChart3, ClipboardList, Wrench, Zap, Truck
} from "lucide-react";

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

type PartStatus = "ok" | "low" | "ordered";
type Category = "אלומיניום" | "זכוכית" | "ברזל" | "חשמל" | "אביזרים";

const statusCfg: Record<PartStatus, { label: string; cls: string }> = {
  ok: { label: "תקין", cls: "bg-emerald-500/20 text-emerald-400" },
  low: { label: "חסר", cls: "bg-red-500/20 text-red-400" },
  ordered: { label: "בהזמנה", cls: "bg-blue-500/20 text-blue-400" },
};

const categoryCfg: Record<Category, string> = {
  "אלומיניום": "bg-cyan-500/20 text-cyan-400",
  "זכוכית": "bg-purple-500/20 text-purple-400",
  "ברזל": "bg-amber-500/20 text-amber-400",
  "חשמל": "bg-yellow-500/20 text-yellow-400",
  "אביזרים": "bg-zinc-500/20 text-zinc-300",
};

const FALLBACK_PARTS = [
  { id: "SPR-001", name: "ידית נעילה רב-נקודתית", category: "אביזרים" as Category, qty: 34, min: 10, status: "ok" as PartStatus, price: 85, monthly: 12, supplier: "נעלית בע\"מ" },
  { id: "SPR-002", name: "אטם סיליקון EPDM 3mm", category: "אביזרים" as Category, qty: 120, min: 50, status: "ok" as PartStatus, price: 12, monthly: 45, supplier: "איטום-פלוס" },
  { id: "SPR-003", name: "גלגלת תריס אלומיניום 180mm", category: "אלומיניום" as Category, qty: 8, min: 15, status: "low" as PartStatus, price: 65, monthly: 10, supplier: "אלוטק" },
  { id: "SPR-004", name: "מנוע חשמלי 24V 350W", category: "חשמל" as Category, qty: 3, min: 5, status: "ordered" as PartStatus, price: 1200, monthly: 4, supplier: "חשמלית הצפון" },
  { id: "SPR-005", name: "זכוכית חילוף 6mm שקופה", category: "זכוכית" as Category, qty: 18, min: 10, status: "ok" as PartStatus, price: 220, monthly: 8, supplier: "זכוכית ישראל" },
  { id: "SPR-006", name: "פרופיל אלומיניום 4500 סדרה", category: "אלומיניום" as Category, qty: 45, min: 20, status: "ok" as PartStatus, price: 38, monthly: 25, supplier: "אלוטק" },
  { id: "SPR-007", name: "ברגים נירוסטה M6x30", category: "ברזל" as Category, qty: 500, min: 200, status: "ok" as PartStatus, price: 1.5, monthly: 180, supplier: "ברגי השרון" },
  { id: "SPR-008", name: "ציר כבד 120mm נירוסטה", category: "ברזל" as Category, qty: 6, min: 10, status: "low" as PartStatus, price: 95, monthly: 7, supplier: "ברגי השרון" },
  { id: "SPR-009", name: "בקר אלקטרוני שער ProX", category: "חשמל" as Category, qty: 1, min: 3, status: "ordered" as PartStatus, price: 2400, monthly: 2, supplier: "חשמלית הצפון" },
  { id: "SPR-010", name: "זכוכית חסינת אש 10mm", category: "זכוכית" as Category, qty: 4, min: 5, status: "ordered" as PartStatus, price: 680, monthly: 3, supplier: "זכוכית ישראל" },
  { id: "SPR-011", name: "מסילת הזזה אלומיניום 2m", category: "אלומיניום" as Category, qty: 2, min: 8, status: "low" as PartStatus, price: 145, monthly: 6, supplier: "אלוטק" },
  { id: "SPR-012", name: "שלט רחוק 433MHz", category: "חשמל" as Category, qty: 15, min: 10, status: "ok" as PartStatus, price: 75, monthly: 9, supplier: "חשמלית הצפון" },
  { id: "SPR-013", name: "גומיית איטום 5x3000mm", category: "אביזרים" as Category, qty: 3, min: 20, status: "low" as PartStatus, price: 28, monthly: 15, supplier: "איטום-פלוס" },
  { id: "SPR-014", name: "צבע פאודר אלומיניום RAL9016", category: "אלומיניום" as Category, qty: 25, min: 10, status: "ok" as PartStatus, price: 190, monthly: 8, supplier: "צבעי אלון" },
  { id: "SPR-015", name: "מנגנון גלילה תריס סטנדרט", category: "אלומיניום" as Category, qty: 0, min: 4, status: "ordered" as PartStatus, price: 320, monthly: 3, supplier: "אלוטק" },
];

const lowStockParts = parts.filter(p => p.qty < p.min);

const FALLBACK_USAGE_BY_FAULT = [
  { fault: "תקלת תריס", topParts: ["גלגלת תריס אלומיניום", "מנגנון גלילה", "אטם סיליקון"], avgPerCall: 2.3, callsMonth: 8 },
  { fault: "תקלת שער חשמלי", topParts: ["מנוע חשמלי 24V", "בקר אלקטרוני", "שלט רחוק"], avgPerCall: 1.8, callsMonth: 5 },
  { fault: "רטיבות חלון", topParts: ["גומיית איטום", "אטם סיליקון", "זכוכית חילוף"], avgPerCall: 3.1, callsMonth: 12 },
  { fault: "ציר שבור / דלת", topParts: ["ציר כבד נירוסטה", "ברגים נירוסטה", "ידית נעילה"], avgPerCall: 2.0, callsMonth: 6 },
  { fault: "החלפת זכוכית", topParts: ["זכוכית חילוף 6mm", "זכוכית חסינת אש", "אטם סיליקון"], avgPerCall: 1.5, callsMonth: 4 },
  { fault: "תחזוקת פרופיל", topParts: ["פרופיל אלומיניום", "צבע פאודר", "מסילת הזזה"], avgPerCall: 2.7, callsMonth: 7 },
];

const FALLBACK_PENDING_ORDERS = [
  { id: "PO-401", partId: "SPR-004", name: "מנוע חשמלי 24V 350W", qty: 5, supplier: "חשמלית הצפון", orderDate: "2026-04-01", eta: "2026-04-12", total: 6000 },
  { id: "PO-402", partId: "SPR-009", name: "בקר אלקטרוני שער ProX", qty: 3, supplier: "חשמלית הצפון", orderDate: "2026-04-02", eta: "2026-04-15", total: 7200 },
  { id: "PO-403", partId: "SPR-010", name: "זכוכית חסינת אש 10mm", qty: 6, supplier: "זכוכית ישראל", orderDate: "2026-04-03", eta: "2026-04-10", total: 4080 },
  { id: "PO-404", partId: "SPR-015", name: "מנגנון גלילה תריס סטנדרט", qty: 8, supplier: "אלוטק", orderDate: "2026-04-05", eta: "2026-04-14", total: 2560 },
];


const parts = FALLBACK_PARTS;

const totalItems = 145;
const inStock = 120;
const missing = lowStockParts.length;
const onOrder = parts.filter(p => p.status === "ordered").length;
const inventoryValue = parts.reduce((s, p) => s + p.qty * p.price, 0);

export default function SparePartsManagement() {
  const { data: sparepartsData } = useQuery({
    queryKey: ["spare-parts"],
    queryFn: () => authFetch("/api/service/spare_parts"),
    staleTime: 5 * 60 * 1000,
  });

  const parts = sparepartsData ?? FALLBACK_PARTS;
  const pendingOrders = FALLBACK_PENDING_ORDERS;
  const usageByFault = FALLBACK_USAGE_BY_FAULT;

  const [activeTab, setActiveTab] = useState("inventory");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Package className="h-7 w-7 text-cyan-400" /> חלקי חילוף לשירות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — ניהול מלאי חלקי חילוף, התראות חוסר, צריכה והזמנות
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "סה\"כ פריטים", value: `${totalItems}`, color: "text-blue-400", icon: Boxes, trend: "+3", up: true },
          { label: "במלאי", value: `${inStock}`, color: "text-emerald-400", icon: ClipboardList, trend: "יציב", up: true },
          { label: "חסרים", value: `${missing}`, color: "text-red-400", icon: AlertTriangle, trend: "+2", up: false },
          { label: "בהזמנה", value: `${onOrder}`, color: "text-amber-400", icon: ShoppingCart, trend: `${onOrder}`, up: true },
          { label: "ערך מלאי", value: fmt(inventoryValue), color: "text-cyan-400", icon: BarChart3, trend: "+5%", up: true },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {kpi.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                      <span className={`text-[10px] ${kpi.up ? "text-emerald-400" : "text-red-400"}`}>{kpi.trend}</span>
                    </div>
                  </div>
                  <Icon className={`h-5 w-5 ${kpi.color} opacity-40`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="inventory" className="text-xs gap-1"><Boxes className="h-3.5 w-3.5" /> מלאי</TabsTrigger>
          <TabsTrigger value="low" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> חסרים</TabsTrigger>
          <TabsTrigger value="usage" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> צריכה</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs gap-1"><ShoppingCart className="h-3.5 w-3.5" /> הזמנות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Inventory */}
        <TabsContent value="inventory" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מק"ט</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">שם חלק</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">קטגוריה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">כמות במלאי</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מינימום</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מצב</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מחיר יחידה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">צריכה חודשית</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">ספק</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parts.map(p => {
                      const stockPct = Math.min(100, (p.qty / Math.max(1, p.min * 2)) * 100);
                      return (
                        <TableRow key={p.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${p.status === "low" ? "bg-red-500/5" : ""}`}>
                          <TableCell className="font-mono text-xs text-blue-400">{p.id}</TableCell>
                          <TableCell className="text-xs font-medium text-foreground">{p.name}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${categoryCfg[p.category]}`}>{p.category}</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <span className={`font-mono text-xs ${p.qty < p.min ? "text-red-400 font-bold" : "text-foreground"}`}>{p.qty}</span>
                              <Progress value={stockPct} className="h-1.5 flex-1 max-w-[50px]" />
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{p.min}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${statusCfg[p.status].cls}`}>{statusCfg[p.status].label}</Badge></TableCell>
                          <TableCell className="font-mono text-xs text-cyan-300">{fmt(p.price)}</TableCell>
                          <TableCell className="font-mono text-xs text-foreground">{p.monthly}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.supplier}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 border-border bg-background/50">
                      <TableCell colSpan={3} className="text-xs font-bold text-foreground">סה"כ ערך מלאי</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{parts.reduce((s, p) => s + p.qty, 0)} יח'</TableCell>
                      <TableCell colSpan={2} />
                      <TableCell className="font-mono text-xs font-bold text-cyan-400">{fmt(inventoryValue)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Low Stock Alert */}
        <TabsContent value="low" className="mt-4 space-y-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <h3 className="text-sm font-bold text-foreground">התראת מלאי נמוך — {lowStockParts.length} פריטים מתחת למינימום</h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מק"ט</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">שם חלק</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">כמות נוכחית</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מינימום נדרש</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">חוסר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מצב</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">עלות להשלמה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">ספק</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockParts.map(p => {
                      const deficit = p.min - p.qty;
                      const fillPct = (p.qty / p.min) * 100;
                      return (
                        <TableRow key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors bg-red-500/5">
                          <TableCell className="font-mono text-xs text-blue-400">{p.id}</TableCell>
                          <TableCell className="text-xs font-medium text-foreground">{p.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <span className="font-mono text-xs text-red-400 font-bold">{p.qty}</span>
                              <Progress value={fillPct} className="h-1.5 flex-1 max-w-[50px]" />
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{p.min}</TableCell>
                          <TableCell className="font-mono text-xs font-bold text-red-400">-{deficit}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${statusCfg[p.status].cls}`}>{statusCfg[p.status].label}</Badge></TableCell>
                          <TableCell className="font-mono text-xs text-amber-300">{fmt(deficit * p.price)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.supplier}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 border-border bg-background/50">
                      <TableCell colSpan={4} className="text-xs font-bold text-foreground">סה"כ עלות השלמה</TableCell>
                      <TableCell colSpan={2} />
                      <TableCell className="font-mono text-xs font-bold text-amber-400">
                        {fmt(lowStockParts.reduce((s, p) => s + (p.min - p.qty) * p.price, 0))}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Usage by Service Type */}
        <TabsContent value="usage" className="mt-4 space-y-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="h-5 w-5 text-purple-400" />
                <h3 className="text-sm font-bold text-foreground">צריכת חלקים לפי סוג תקלה</h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סוג תקלה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">חלקים עיקריים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">ממוצע חלקים לקריאה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">קריאות / חודש</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">צריכה חודשית</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageByFault.map((u, i) => {
                      const totalConsumption = Math.round(u.avgPerCall * u.callsMonth);
                      const maxCalls = Math.max(...usageByFault.map(x => x.callsMonth));
                      const barPct = (u.callsMonth / maxCalls) * 100;
                      return (
                        <TableRow key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <TableCell className="text-xs font-medium text-foreground flex items-center gap-1.5">
                            <Zap className="h-3 w-3 text-amber-400" />{u.fault}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <div className="flex flex-wrap gap-1">
                              {u.topParts.map((tp, j) => (
                                <Badge key={j} className="text-[9px] bg-zinc-500/20 text-zinc-300">{tp}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-cyan-300">{u.avgPerCall}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <span className="font-mono text-xs text-foreground">{u.callsMonth}</span>
                              <Progress value={barPct} className="h-1.5 flex-1 max-w-[60px]" />
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-purple-400">{totalConsumption} יח'</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Top consumed parts summary */}
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-400" /> חלקים בצריכה גבוהה ביותר
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {parts
                  .sort((a, b) => b.monthly - a.monthly)
                  .slice(0, 6)
                  .map(p => {
                    const maxMonthly = Math.max(...parts.map(x => x.monthly));
                    const pct = (p.monthly / maxMonthly) * 100;
                    return (
                      <div key={p.id} className="bg-background/50 border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-foreground truncate max-w-[160px]">{p.name}</span>
                          <span className="font-mono text-xs text-cyan-400">{p.monthly}/חודש</span>
                        </div>
                        <Progress value={pct} className="h-2 mb-1" />
                        <div className="flex items-center justify-between">
                          <Badge className={`text-[9px] ${categoryCfg[p.category]}`}>{p.category}</Badge>
                          <span className="text-[10px] text-muted-foreground">מלאי: {p.qty}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Orders */}
        <TabsContent value="orders" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-foreground">הזמנות פתוחות</h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מס' הזמנה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מק"ט</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">שם חלק</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">כמות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">ספק</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תאריך הזמנה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מועד הגעה צפוי</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סה"כ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingOrders.map(o => {
                      const etaDate = new Date(o.eta);
                      const now = new Date("2026-04-08");
                      const daysLeft = Math.round((etaDate.getTime() - now.getTime()) / 86400000);
                      return (
                        <TableRow key={o.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${daysLeft <= 2 ? "bg-emerald-500/5" : ""}`}>
                          <TableCell className="font-mono text-xs text-blue-400">{o.id}</TableCell>
                          <TableCell className="font-mono text-xs text-purple-400">{o.partId}</TableCell>
                          <TableCell className="text-xs font-medium text-foreground">{o.name}</TableCell>
                          <TableCell className="font-mono text-xs text-foreground">{o.qty}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{o.supplier}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{o.orderDate}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-foreground">{o.eta}</span>
                              <Badge className={`text-[9px] ${daysLeft <= 2 ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-300"}`}>
                                {daysLeft <= 0 ? "הגיע" : `${daysLeft} ימים`}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-cyan-300">{fmt(o.total)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 border-border bg-background/50">
                      <TableCell colSpan={7} className="text-xs font-bold text-foreground">סה"כ הזמנות פתוחות</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-cyan-400">
                        {fmt(pendingOrders.reduce((s, o) => s + o.total, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
