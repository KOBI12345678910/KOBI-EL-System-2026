import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ShoppingCart, DollarSign, Clock, Ship, Package, TrendingUp,
  Globe, Anchor, AlertCircle, CheckCircle2, ArrowLeftRight, FileText,
} from "lucide-react";

type Status =
  | "draft" | "pending_approval" | "approved" | "sent_to_supplier"
  | "supplier_confirmed" | "production_in_progress" | "ready_to_ship"
  | "shipped" | "in_transit" | "arrived" | "partially_received"
  | "fully_received" | "closed" | "cancelled";

interface ImportOrder {
  id: string;
  supplier: string;
  country: string;
  countryFlag: string;
  currency: string;
  totalForeign: number;
  landedCostILS: number;
  incoterm: string;
  status: Status;
  expectedArrival: string;
  items: number;
}

const statusConfig: Record<Status, { label: string; color: string }> = {
  draft:                 { label: "טיוטה",           color: "bg-slate-500/20 text-slate-400" },
  pending_approval:      { label: "ממתין לאישור",    color: "bg-yellow-500/20 text-yellow-400" },
  approved:              { label: "מאושר",           color: "bg-emerald-500/20 text-emerald-400" },
  sent_to_supplier:      { label: "נשלח לספק",       color: "bg-blue-500/20 text-blue-400" },
  supplier_confirmed:    { label: "ספק אישר",        color: "bg-indigo-500/20 text-indigo-400" },
  production_in_progress:{ label: "בייצור",          color: "bg-violet-500/20 text-violet-400" },
  ready_to_ship:         { label: "מוכן למשלוח",     color: "bg-cyan-500/20 text-cyan-400" },
  shipped:               { label: "נשלח",            color: "bg-sky-500/20 text-sky-400" },
  in_transit:            { label: "בדרך",            color: "bg-blue-600/20 text-blue-300" },
  arrived:               { label: "הגיע",            color: "bg-teal-500/20 text-teal-400" },
  partially_received:    { label: "התקבל חלקית",     color: "bg-orange-500/20 text-orange-400" },
  fully_received:        { label: "התקבל במלואו",    color: "bg-green-500/20 text-green-400" },
  closed:                { label: "סגור",            color: "bg-gray-500/20 text-gray-400" },
  cancelled:             { label: "בוטל",            color: "bg-red-500/20 text-red-400" },
};

const currencySymbol: Record<string, string> = { USD: "$", EUR: "\u20AC", ILS: "\u20AA", TRY: "\u20BA", CNY: "\u00A5" };

const orders: ImportOrder[] = [
  { id: "IPO-001", supplier: "Istanbul Aluminyum A.S.",     country: "טורקיה",  countryFlag: "TR", currency: "USD", totalForeign: 87500,  landedCostILS: 342000,  incoterm: "CIF",  status: "in_transit",            expectedArrival: "2026-04-18", items: 14 },
  { id: "IPO-002", supplier: "Guangzhou Fittings Ltd.",     country: "סין",     countryFlag: "CN", currency: "USD", totalForeign: 124000, landedCostILS: 496000,  incoterm: "FOB",  status: "production_in_progress", expectedArrival: "2026-05-10", items: 38 },
  { id: "IPO-003", supplier: "Schuco International KG",    country: "גרמניה",  countryFlag: "DE", currency: "EUR", totalForeign: 215000, landedCostILS: 875000,  incoterm: "DAP",  status: "approved",               expectedArrival: "2026-05-25", items: 22 },
  { id: "IPO-004", supplier: "Mecal S.p.A.",               country: "איטליה",  countryFlag: "IT", currency: "EUR", totalForeign: 68000,  landedCostILS: 278000,  incoterm: "EXW",  status: "shipped",                expectedArrival: "2026-04-22", items: 9 },
  { id: "IPO-005", supplier: "Shenzhen Hardware Co.",       country: "סין",     countryFlag: "CN", currency: "USD", totalForeign: 43500,  landedCostILS: 174000,  incoterm: "FOB",  status: "fully_received",         expectedArrival: "2026-03-28", items: 56 },
  { id: "IPO-006", supplier: "Izmir Profil Sanayi",        country: "טורקיה",  countryFlag: "TR", currency: "USD", totalForeign: 96200,  landedCostILS: 376000,  incoterm: "CIF",  status: "arrived",                expectedArrival: "2026-04-08", items: 18 },
  { id: "IPO-007", supplier: "Hydro Aluminium Deutschland",country: "גרמניה",  countryFlag: "DE", currency: "EUR", totalForeign: 178000, landedCostILS: 724000,  incoterm: "DDP",  status: "pending_approval",       expectedArrival: "2026-06-15", items: 11 },
  { id: "IPO-008", supplier: "Aluk Group Italia",          country: "איטליה",  countryFlag: "IT", currency: "EUR", totalForeign: 52000,  landedCostILS: 212000,  incoterm: "FCA",  status: "partially_received",     expectedArrival: "2026-04-05", items: 7 },
  { id: "IPO-009", supplier: "Antalya Cam ve Ayna",        country: "טורקיה",  countryFlag: "TR", currency: "USD", totalForeign: 31800,  landedCostILS: 124500,  incoterm: "CFR",  status: "draft",                  expectedArrival: "2026-07-01", items: 20 },
  { id: "IPO-010", supplier: "Beijing Steel Profiles",     country: "סין",     countryFlag: "CN", currency: "CNY", totalForeign: 580000, landedCostILS: 298000,  incoterm: "FOB",  status: "supplier_confirmed",     expectedArrival: "2026-05-20", items: 42 },
];

const fmt = (n: number) => n.toLocaleString("he-IL");
const fmtCurrency = (amount: number, cur: string) => `${currencySymbol[cur] || cur}${fmt(amount)}`;

const inTransitStatuses: Status[] = ["shipped", "in_transit"];
const waitingStatuses: Status[] = ["draft", "pending_approval", "approved", "sent_to_supplier", "supplier_confirmed", "production_in_progress", "ready_to_ship"];
const receivedStatuses: Status[] = ["arrived", "partially_received", "fully_received", "closed"];

export default function ImportPurchaseOrders() {
  const [tab, setTab] = useState("all");

  const openOrders = orders.filter(o => !["fully_received", "closed", "cancelled"].includes(o.status));
  const transitOrders = orders.filter(o => inTransitStatuses.includes(o.status));
  const totalValueUSD = orders.reduce((s, o) => {
    if (o.currency === "USD") return s + o.totalForeign;
    if (o.currency === "EUR") return s + o.totalForeign * 1.08;
    if (o.currency === "CNY") return s + o.totalForeign * 0.14;
    return s + o.totalForeign;
  }, 0);
  const totalValueILS = orders.reduce((s, o) => s + o.landedCostILS, 0);
  const avgLeadDays = 42;

  const filtered = tab === "all" ? orders
    : tab === "transit" ? orders.filter(o => inTransitStatuses.includes(o.status))
    : tab === "waiting" ? orders.filter(o => waitingStatuses.includes(o.status))
    : orders.filter(o => receivedStatuses.includes(o.status));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingCart className="h-7 w-7 text-blue-400" />
          הזמנות יבוא
        </h1>
        <Badge variant="outline" className="text-xs">טכנו-כל עוזי</Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-slate-700 bg-slate-900/60">
          <CardContent className="pt-5 text-center space-y-1">
            <Package className="h-5 w-5 mx-auto text-slate-400" />
            <p className="text-xs text-muted-foreground">סה"כ הזמנות</p>
            <p className="text-2xl font-bold">{orders.length}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-800 bg-slate-900/60">
          <CardContent className="pt-5 text-center space-y-1">
            <TrendingUp className="h-5 w-5 mx-auto text-blue-400" />
            <p className="text-xs text-muted-foreground">פתוחות</p>
            <p className="text-2xl font-bold text-blue-400">{openOrders.length}</p>
          </CardContent>
        </Card>
        <Card className="border-sky-800 bg-slate-900/60">
          <CardContent className="pt-5 text-center space-y-1">
            <Ship className="h-5 w-5 mx-auto text-sky-400" />
            <p className="text-xs text-muted-foreground">בדרך</p>
            <p className="text-2xl font-bold text-sky-400">{transitOrders.length}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-800 bg-slate-900/60">
          <CardContent className="pt-5 text-center space-y-1">
            <Anchor className="h-5 w-5 mx-auto text-amber-400" />
            <p className="text-xs text-muted-foreground">ממתין למכס</p>
            <p className="text-2xl font-bold text-amber-400">
              {orders.filter(o => o.status === "arrived").length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-green-800 bg-slate-900/60">
          <CardContent className="pt-5 text-center space-y-1">
            <DollarSign className="h-5 w-5 mx-auto text-green-400" />
            <p className="text-xs text-muted-foreground">שווי כולל</p>
            <p className="text-lg font-bold text-green-400">${fmt(Math.round(totalValueUSD))}</p>
            <p className="text-xs text-muted-foreground">{fmtCurrency(totalValueILS, "ILS")}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-800 bg-slate-900/60">
          <CardContent className="pt-5 text-center space-y-1">
            <Clock className="h-5 w-5 mx-auto text-purple-400" />
            <p className="text-xs text-muted-foreground">זמן אספקה ממוצע</p>
            <p className="text-2xl font-bold text-purple-400">{avgLeadDays}</p>
            <p className="text-xs text-muted-foreground">ימים</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Overview */}
      <Card className="border-slate-700 bg-slate-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" />
            התפלגות לפי מדינה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "טורקיה", count: orders.filter(o => o.countryFlag === "TR").length, color: "bg-red-500" },
            { name: "סין", count: orders.filter(o => o.countryFlag === "CN").length, color: "bg-yellow-500" },
            { name: "גרמניה", count: orders.filter(o => o.countryFlag === "DE").length, color: "bg-blue-500" },
            { name: "איטליה", count: orders.filter(o => o.countryFlag === "IT").length, color: "bg-green-500" },
          ].map(c => (
            <div key={c.name} className="flex items-center gap-3">
              <span className="text-sm w-16 text-muted-foreground">{c.name}</span>
              <Progress value={(c.count / orders.length) * 100} className={`h-2 flex-1 [&>div]:${c.color}`} />
              <span className="text-sm font-medium w-6 text-left">{c.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Status Pipeline + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Pipeline */}
        <Card className="border-slate-700 bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-indigo-400" />
              צינור סטטוסים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {([
              { key: "draft" as Status, icon: <FileText className="h-3.5 w-3.5" /> },
              { key: "pending_approval" as Status, icon: <Clock className="h-3.5 w-3.5" /> },
              { key: "approved" as Status, icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
              { key: "production_in_progress" as Status, icon: <Package className="h-3.5 w-3.5" /> },
              { key: "shipped" as Status, icon: <Ship className="h-3.5 w-3.5" /> },
              { key: "in_transit" as Status, icon: <Globe className="h-3.5 w-3.5" /> },
              { key: "arrived" as Status, icon: <Anchor className="h-3.5 w-3.5" /> },
              { key: "fully_received" as Status, icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
            ] as const).map(({ key, icon }) => {
              const count = orders.filter(o => o.status === key).length;
              const sc = statusConfig[key];
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className={`${sc.color.split(" ")[1]} opacity-80`}>{icon}</span>
                  <span className="text-xs w-28 truncate">{sc.label}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${sc.color.split(" ")[0].replace("/20", "/60")}`}
                      style={{ width: `${(count / orders.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono w-4 text-left">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-slate-700 bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              פעילות אחרונה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { time: "היום 09:15", text: "IPO-006 הגיע לנמל אשדוד - ממתין לשחרור מכס", color: "text-teal-400" },
              { time: "היום 08:30", text: "IPO-001 עבר מעקב GPS - נמצא בים התיכון", color: "text-blue-300" },
              { time: "אתמול 16:45", text: "IPO-004 נשלח מנמל ג'נובה, איטליה", color: "text-sky-400" },
              { time: "אתמול 11:20", text: "IPO-008 קיבלנו 5 מתוך 7 פריטים - חלקי", color: "text-orange-400" },
              { time: "06/04 14:00", text: "IPO-003 אושר ע\"י מנהל הרכש", color: "text-emerald-400" },
              { time: "05/04 09:00", text: "IPO-010 ספק Beijing Steel אישר הזמנה", color: "text-indigo-400" },
              { time: "04/04 17:30", text: "IPO-002 נכנס לייצור במפעל Guangzhou", color: "text-violet-400" },
              { time: "03/04 10:15", text: "IPO-005 התקבל במלואו - 56 פריטים נבדקו", color: "text-green-400" },
            ].map((ev, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-[10px] text-muted-foreground w-20 pt-0.5 shrink-0">{ev.time}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 shrink-0" />
                <span className={`text-xs ${ev.color}`}>{ev.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Table */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="all">כל ההזמנות ({orders.length})</TabsTrigger>
          <TabsTrigger value="transit">בדרך ({orders.filter(o => inTransitStatuses.includes(o.status)).length})</TabsTrigger>
          <TabsTrigger value="waiting">ממתינות ({orders.filter(o => waitingStatuses.includes(o.status)).length})</TabsTrigger>
          <TabsTrigger value="received">התקבלו ({orders.filter(o => receivedStatuses.includes(o.status)).length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border-slate-700 bg-slate-900/60">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right">מספר הזמנה</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">מדינה</TableHead>
                    <TableHead className="text-right">מטבע</TableHead>
                    <TableHead className="text-right">סכום מט"ח</TableHead>
                    <TableHead className="text-right">עלות נחיתה ILS</TableHead>
                    <TableHead className="text-right">Incoterm</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">הגעה צפויה</TableHead>
                    <TableHead className="text-right">פריטים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(order => {
                    const sc = statusConfig[order.status];
                    return (
                      <TableRow key={order.id} className="border-slate-700 hover:bg-slate-800/60 cursor-pointer">
                        <TableCell className="font-mono font-semibold text-blue-400">{order.id}</TableCell>
                        <TableCell>{order.supplier}</TableCell>
                        <TableCell>{order.country}</TableCell>
                        <TableCell className="font-mono">{order.currency}</TableCell>
                        <TableCell className="font-mono">{fmtCurrency(order.totalForeign, order.currency)}</TableCell>
                        <TableCell className="font-mono">{fmtCurrency(order.landedCostILS, "ILS")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-mono">{order.incoterm}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={sc.color}>{sc.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{order.expectedArrival}</TableCell>
                        <TableCell className="text-center">{order.items}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        אין הזמנות בקטגוריה זו
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Summary Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-slate-700 pt-4">
        <span>סה"כ {filtered.length} הזמנות מוצגות</span>
        <span>
          שווי מוצג: {fmtCurrency(filtered.reduce((s, o) => s + o.landedCostILS, 0), "ILS")}
        </span>
        <span>עדכון אחרון: {new Date().toLocaleDateString("he-IL")}</span>
      </div>
    </div>
  );
}
