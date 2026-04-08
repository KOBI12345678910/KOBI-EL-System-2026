import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ShoppingCart, FileText, Clock, Truck, PackageCheck, Ban,
  TrendingUp, TrendingDown, DollarSign, CheckCircle2, AlertTriangle,
  Search, Filter, Package
} from "lucide-react";

const fmt = (v: number) => "₪" + new Intl.NumberFormat("he-IL").format(v);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";

type Status = "טיוטה" | "ממתין לאישור" | "מאושר" | "נשלח לספק" | "בדרך" | "התקבל חלקית" | "התקבל" | "בוטל";
type Approval = "ממתין" | "מאושר" | "נדחה";

const statusColors: Record<Status, string> = {
  "טיוטה": "bg-gray-500/20 text-gray-300",
  "ממתין לאישור": "bg-yellow-500/20 text-yellow-300",
  "מאושר": "bg-blue-500/20 text-blue-300",
  "נשלח לספק": "bg-indigo-500/20 text-indigo-300",
  "בדרך": "bg-purple-500/20 text-purple-300",
  "התקבל חלקית": "bg-orange-500/20 text-orange-300",
  "התקבל": "bg-green-500/20 text-green-300",
  "בוטל": "bg-red-500/20 text-red-300",
};

const approvalColors: Record<Approval, string> = {
  "ממתין": "bg-yellow-500/20 text-yellow-300",
  "מאושר": "bg-green-500/20 text-green-300",
  "נדחה": "bg-red-500/20 text-red-300",
};

interface PurchaseOrder {
  poNumber: string;
  supplier: string;
  orderDate: string;
  itemsCount: number;
  totalAmount: number;
  status: Status;
  expectedDelivery: string;
  actualDelivery: string;
  approval: Approval;
}

const orders: PurchaseOrder[] = [
  { poNumber: "PO-2026-001", supplier: "מפעלי אלומיניום הגליל", orderDate: "2026-04-01", itemsCount: 12, totalAmount: 245000, status: "התקבל", expectedDelivery: "2026-04-10", actualDelivery: "2026-04-09", approval: "מאושר" },
  { poNumber: "PO-2026-002", supplier: "זכוכית שומרון בע\"מ", orderDate: "2026-04-02", itemsCount: 8, totalAmount: 178500, status: "בדרך", expectedDelivery: "2026-04-15", actualDelivery: "", approval: "מאושר" },
  { poNumber: "PO-2026-003", supplier: "ברזל ופלדה נתניה", orderDate: "2026-04-03", itemsCount: 15, totalAmount: 412000, status: "נשלח לספק", expectedDelivery: "2026-04-20", actualDelivery: "", approval: "מאושר" },
  { poNumber: "PO-2026-004", supplier: "חומרי בניין השפלה", orderDate: "2026-04-04", itemsCount: 5, totalAmount: 67800, status: "ממתין לאישור", expectedDelivery: "2026-04-22", actualDelivery: "", approval: "ממתין" },
  { poNumber: "PO-2026-005", supplier: "פרופילי אלומיניום עוזי", orderDate: "2026-03-28", itemsCount: 20, totalAmount: 498000, status: "התקבל חלקית", expectedDelivery: "2026-04-05", actualDelivery: "", approval: "מאושר" },
  { poNumber: "PO-2026-006", supplier: "Foshan Glass Trading Co.", orderDate: "2026-03-25", itemsCount: 6, totalAmount: 325000, status: "בדרך", expectedDelivery: "2026-04-08", actualDelivery: "", approval: "מאושר" },
  { poNumber: "PO-2026-007", supplier: "אביזרי נעילה ד.מ.", orderDate: "2026-04-05", itemsCount: 30, totalAmount: 18900, status: "טיוטה", expectedDelivery: "2026-04-25", actualDelivery: "", approval: "ממתין" },
  { poNumber: "PO-2026-008", supplier: "Schüco International KG", orderDate: "2026-03-20", itemsCount: 4, totalAmount: 156200, status: "התקבל", expectedDelivery: "2026-04-06", actualDelivery: "2026-04-07", approval: "מאושר" },
  { poNumber: "PO-2026-009", supplier: "מתכת ומסגרות ראשל\"צ", orderDate: "2026-04-06", itemsCount: 10, totalAmount: 89500, status: "מאושר", expectedDelivery: "2026-04-18", actualDelivery: "", approval: "מאושר" },
  { poNumber: "PO-2026-010", supplier: "גומי ואטמים תעשייתי", orderDate: "2026-03-15", itemsCount: 25, totalAmount: 7200, status: "בוטל", expectedDelivery: "2026-03-30", actualDelivery: "", approval: "נדחה" },
];

const isDelayed = (o: PurchaseOrder) => {
  if (o.status === "התקבל" || o.status === "בוטל") return false;
  return new Date(o.expectedDelivery) < new Date("2026-04-08");
};

export default function PurchaseOrders() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = [...orders];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(o =>
        o.poNumber.toLowerCase().includes(s) ||
        o.supplier.toLowerCase().includes(s)
      );
    }
    switch (activeTab) {
      case "pending": return list.filter(o => o.status === "ממתין לאישור" || o.status === "טיוטה" || o.status === "נשלח לספק");
      case "delayed": return list.filter(o => isDelayed(o));
      case "history": return list.filter(o => o.status === "התקבל" || o.status === "בוטל");
      default: return list;
    }
  }, [activeTab, search]);

  const totalOrders = orders.length;
  const openOrders = orders.filter(o => !["התקבל", "בוטל"].includes(o.status)).length;
  const pendingApproval = orders.filter(o => o.approval === "ממתין").length;
  const inTransit = orders.filter(o => o.status === "בדרך").length;
  const received = orders.filter(o => o.status === "התקבל" || o.status === "התקבל חלקית").length;
  const totalValue = orders.filter(o => o.status !== "בוטל").reduce((s, o) => s + o.totalAmount, 0);
  const filteredTotal = filtered.reduce((s, o) => s + o.totalAmount, 0);
  const deliveryProgress = Math.round((received / totalOrders) * 100);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-blue-400" /> הזמנות רכש
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">ניהול הזמנות רכש, מעקב אספקות ואישורים — טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "הזמנות החודש", value: String(totalOrders), icon: FileText, color: "text-blue-400", trend: "+3", up: true },
          { label: "הזמנות פתוחות", value: String(openOrders), icon: Package, color: "text-indigo-400", trend: String(openOrders), up: false },
          { label: "ממתינות לאישור", value: String(pendingApproval), icon: Clock, color: "text-yellow-400", trend: "+1", up: false },
          { label: "בדרך", value: String(inTransit), icon: Truck, color: "text-purple-400", trend: "2 משלוחים", up: true },
          { label: "התקבלו", value: String(received), icon: PackageCheck, color: "text-green-400", trend: `${deliveryProgress}%`, up: true },
          { label: "סה\"כ ערך ₪", value: fmt(totalValue), icon: DollarSign, color: "text-emerald-400", trend: "+12%", up: true },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {kpi.up ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-yellow-400" />}
                      <span className={`text-[10px] ${kpi.up ? "text-green-400" : "text-yellow-400"}`}>{kpi.trend}</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-700/50">
                    <Icon className={`h-4 w-4 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Delivery Progress */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">התקדמות אספקות החודש</span>
            <span className="text-sm font-mono text-emerald-400">{deliveryProgress}%</span>
          </div>
          <Progress value={deliveryProgress} className="h-2" />
        </CardContent>
      </Card>

      {/* Search */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש לפי מספר הזמנה או ספק..."
                className="w-full pr-9 pl-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>{filtered.length} תוצאות</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs + Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl bg-slate-800/80 border border-slate-700">
          <TabsTrigger value="all" className="text-xs gap-1 data-[state=active]:bg-blue-600">
            <FileText className="h-3.5 w-3.5" /> כל ההזמנות ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-xs gap-1 data-[state=active]:bg-yellow-600">
            <Clock className="h-3.5 w-3.5" /> ממתינות ({orders.filter(o => o.status === "ממתין לאישור" || o.status === "טיוטה" || o.status === "נשלח לספק").length})
          </TabsTrigger>
          <TabsTrigger value="delayed" className="text-xs gap-1 data-[state=active]:bg-red-600">
            <AlertTriangle className="h-3.5 w-3.5" /> באיחור ({orders.filter(o => isDelayed(o)).length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1 data-[state=active]:bg-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> היסטוריה ({orders.filter(o => o.status === "התקבל" || o.status === "בוטל").length})
          </TabsTrigger>
        </TabsList>

        {["all", "pending", "delayed", "history"].map(tab => (
          <TabsContent key={tab} value={tab}>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 bg-slate-900/50">
                        <TableHead className="text-right text-[11px] font-semibold text-muted-foreground">מס' הזמנה</TableHead>
                        <TableHead className="text-right text-[11px] font-semibold text-muted-foreground">ספק</TableHead>
                        <TableHead className="text-right text-[11px] font-semibold text-muted-foreground">תאריך הזמנה</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold text-muted-foreground">פריטים</TableHead>
                        <TableHead className="text-right text-[11px] font-semibold text-muted-foreground">סכום</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold text-muted-foreground">סטטוס</TableHead>
                        <TableHead className="text-right text-[11px] font-semibold text-muted-foreground">אספקה צפויה</TableHead>
                        <TableHead className="text-right text-[11px] font-semibold text-muted-foreground">אספקה בפועל</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold text-muted-foreground">אישור</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            <Search className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            <p>לא נמצאו הזמנות</p>
                          </TableCell>
                        </TableRow>
                      ) : filtered.map(order => (
                        <TableRow
                          key={order.poNumber}
                          className={`border-slate-700/50 hover:bg-slate-700/30 transition-colors ${isDelayed(order) ? "bg-red-500/5" : ""}`}
                        >
                          <TableCell className="font-mono text-xs text-blue-400 font-medium">{order.poNumber}</TableCell>
                          <TableCell className="text-sm font-medium text-foreground">{order.supplier}</TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">{fmtDate(order.orderDate)}</TableCell>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">{order.itemsCount}</TableCell>
                          <TableCell className="font-mono text-sm font-bold text-emerald-400">{fmt(order.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={`${statusColors[order.status]} border-0 text-[10px]`}>{order.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            <span className={isDelayed(order) ? "text-red-400 font-bold" : ""}>
                              {fmtDate(order.expectedDelivery)}
                            </span>
                            {isDelayed(order) && <AlertTriangle className="h-3 w-3 text-red-400 inline mr-1" />}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{fmtDate(order.actualDelivery)}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={`${approvalColors[order.approval]} border-0 text-[10px]`}>{order.approval}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Summary Row */}
                {filtered.length > 0 && (
                  <div className="border-t border-slate-700 bg-slate-900/60 px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-6">
                        <span className="text-muted-foreground">
                          סה"כ <span className="font-bold text-foreground">{filtered.length}</span> הזמנות
                        </span>
                        <span className="text-muted-foreground">
                          פריטים: <span className="font-bold font-mono text-foreground">{filtered.reduce((s, o) => s + o.itemsCount, 0)}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">סכום כולל:</span>
                        <span className="font-bold font-mono text-lg text-emerald-400">{fmt(filteredTotal)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
