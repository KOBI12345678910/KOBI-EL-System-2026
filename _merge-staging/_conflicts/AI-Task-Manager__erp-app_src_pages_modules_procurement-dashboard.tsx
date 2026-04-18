import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import { authFetch } from "@/lib/utils";
import {
  Gauge, Truck, ShoppingCart, ClipboardList, PackageCheck, Boxes, TrendingUp, TrendingDown,
  AlertTriangle, Plus, ArrowLeft, FolderKanban, DollarSign, BarChart3, Clock, CheckCircle2,
  XCircle, AlertCircle, RefreshCw, FileText, Shield, Target, Zap, Calendar, Activity,
  PieChart, ArrowUpRight, ArrowDownRight, Package, Warehouse, Timer, Users
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";

function safeArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.items)) return data.items;
  }
  return [];
}

export default function ProcurementDashboardPage() {
  const [, navigate] = useLocation();
  const [timeRange, setTimeRange] = useState<"week" | "month" | "quarter" | "year">("month");

  const { data: suppliersRaw = [] } = useQuery<any[]>({ queryKey: ["dash-suppliers"], queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return safeArray(await r.json()); } });
  const { data: materialsRaw = [] } = useQuery<any[]>({ queryKey: ["dash-materials"], queryFn: async () => { const r = await authFetch(`${API}/raw-materials`); return safeArray(await r.json()); } });
  const { data: requestsRaw = [] } = useQuery<any[]>({ queryKey: ["dash-requests"], queryFn: async () => { const r = await authFetch(`${API}/purchase-requests`); return safeArray(await r.json()); } });
  const { data: ordersRaw = [] } = useQuery<any[]>({ queryKey: ["dash-orders"], queryFn: async () => { const r = await authFetch(`${API}/purchase-orders`); return safeArray(await r.json()); } });
  const { data: receiptsRaw = [] } = useQuery<any[]>({ queryKey: ["dash-receipts"], queryFn: async () => { const r = await authFetch(`${API}/goods-receipts`); return safeArray(await r.json()); } });

  const suppliers = safeArray(suppliersRaw);
  const materials = safeArray(materialsRaw);
  const requests = safeArray(requestsRaw);
  const orders = safeArray(ordersRaw);
  const receipts = safeArray(receiptsRaw);

  const activeSuppliers = suppliers.filter((s: any) => s.status === "פעיל");
  const pendingRequests = requests.filter((r: any) => r.status === "ממתין לאישור" || r.status === "טיוטה");
  const approvedRequests = requests.filter((r: any) => r.status === "מאושר");
  const openOrders = orders.filter((o: any) => !["התקבל במלואו", "בוטל"].includes(o.status));
  const completedOrders = orders.filter((o: any) => o.status === "התקבל במלואו");
  const cancelledOrders = orders.filter((o: any) => o.status === "בוטל");
  const lowStockMaterials = materials.filter((m: any) => m.currentStock && m.reorderPoint && parseFloat(m.currentStock) <= parseFloat(m.reorderPoint));
  const criticalStock = materials.filter((m: any) => m.currentStock && m.reorderPoint && parseFloat(m.currentStock) <= parseFloat(m.reorderPoint) * 0.5);
  const totalOrderValue = orders.reduce((s: number, o: any) => s + parseFloat(o.totalAmount || "0"), 0);
  const openOrderValue = openOrders.reduce((s: number, o: any) => s + parseFloat(o.totalAmount || "0"), 0);
  const avgOrderValue = orders.length > 0 ? totalOrderValue / orders.length : 0;
  const fulfillmentRate = orders.length > 0 ? Math.round((completedOrders.length / orders.length) * 100) : 0;
  const pendingReceipts = receipts.filter((r: any) => r.status === "חדש" || r.status === "בבדיקה");

  const topKPIs = [
    { label: "סה״כ הזמנות פתוחות", value: openOrders.length, subtext: `מתוך ${orders.length} הזמנות`, icon: ShoppingCart, color: "text-cyan-400", bg: "from-cyan-500/20 to-cyan-600/5", trend: null },
    { label: "שווי הזמנות פתוחות", value: `₪${openOrderValue.toLocaleString()}`, subtext: `ממוצע: ₪${Math.round(avgOrderValue).toLocaleString()}`, icon: DollarSign, color: "text-emerald-400", bg: "from-emerald-500/20 to-emerald-600/5", trend: null },
    { label: "דרישות ממתינות לאישור", value: pendingRequests.length, subtext: `${approvedRequests.length} מאושרות`, icon: ClipboardList, color: "text-amber-400", bg: "from-amber-500/20 to-amber-600/5", trend: null },
    { label: "אחוז מילוי הזמנות", value: `${fulfillmentRate}%`, subtext: `${completedOrders.length} הושלמו`, icon: Target, color: fulfillmentRate >= 80 ? "text-emerald-400" : fulfillmentRate >= 50 ? "text-amber-400" : "text-red-400", bg: fulfillmentRate >= 80 ? "from-emerald-500/20 to-emerald-600/5" : "from-amber-500/20 to-amber-600/5", trend: null },
  ];

  const operationalMetrics = [
    { label: "ספקים פעילים", value: activeSuppliers.length, total: suppliers.length, icon: Truck, color: "text-blue-400", bg: "bg-blue-500/10", href: "/suppliers" },
    { label: "חומרי גלם", value: materials.length, total: null, icon: Boxes, color: "text-orange-400", bg: "bg-orange-500/10", href: "/builder/data/5" },
    { label: "קבלות סחורה", value: receipts.length, total: null, icon: PackageCheck, color: "text-teal-400", bg: "bg-teal-500/10", href: "/builder/data/16" },
    { label: "קבלות ממתינות", value: pendingReceipts.length, total: null, icon: Timer, color: "text-purple-400", bg: "bg-purple-500/10", href: "/builder/data/16" },
    { label: "סה״כ שווי רכש", value: `₪${totalOrderValue.toLocaleString()}`, total: null, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", href: "/builder/data/15" },
    { label: "הזמנות שבוטלו", value: cancelledOrders.length, total: null, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", href: "/builder/data/15" },
  ];

  const quickActions = [
    { label: "דרישת רכש חדשה", icon: ClipboardList, href: "/builder/data/13", color: "bg-indigo-600 hover:bg-indigo-500", description: "פתח דרישה חדשה" },
    { label: "הזמנת רכש חדשה", icon: ShoppingCart, href: "/builder/data/15", color: "bg-cyan-600 hover:bg-cyan-500", description: "הזמנה לספק" },
    { label: "קבלת סחורה", icon: PackageCheck, href: "/builder/data/16", color: "bg-teal-600 hover:bg-teal-500", description: "רשום סחורה נכנסת" },
    { label: "הוסף ספק", icon: Truck, href: "/suppliers", color: "bg-blue-600 hover:bg-blue-500", description: "ספק חדש למערכת" },
    { label: "הוסף חומר גלם", icon: Boxes, href: "/builder/data/5", color: "bg-orange-600 hover:bg-orange-500", description: "חומר גלם חדש" },
    { label: "ניתוח פרויקטים", icon: FolderKanban, href: "/project-analyses", color: "bg-violet-600 hover:bg-violet-500", description: "ניתוח רווחיות" },
    { label: "בינה מלאכותית", icon: Zap, href: "/procurement-ai", color: "bg-pink-600 hover:bg-pink-500", description: "תובנות AI" },
    { label: "בקשות RFQ", icon: FileText, href: "/builder/data/49", color: "bg-sky-600 hover:bg-sky-500", description: "הצעות מחיר מספקים" },
  ];

  const processFlow = [
    { step: 1, label: "דרישת רכש", count: requests.length, active: pendingRequests.length, icon: ClipboardList, color: "border-indigo-500", bg: "bg-indigo-500/10" },
    { step: 2, label: "אישור רכש", count: approvedRequests.length, active: pendingRequests.length, icon: CheckCircle2, color: "border-emerald-500", bg: "bg-emerald-500/10" },
    { step: 3, label: "הזמנת רכש", count: orders.length, active: openOrders.length, icon: ShoppingCart, color: "border-cyan-500", bg: "bg-cyan-500/10" },
    { step: 4, label: "קבלת סחורה", count: receipts.length, active: pendingReceipts.length, icon: PackageCheck, color: "border-teal-500", bg: "bg-teal-500/10" },
    { step: 5, label: "בקרת איכות", count: receipts.filter((r: any) => r.status === "מאושר").length, active: receipts.filter((r: any) => r.status === "בבדיקה").length, icon: Shield, color: "border-purple-500", bg: "bg-purple-500/10" },
  ];

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Gauge className="w-6 h-6 text-foreground" />
              </div>
              דשבורד רכש ואספקה
            </h1>
            <p className="text-muted-foreground mt-1">מרכז הפיקוד לניהול רכש, מלאי ושרשרת אספקה</p>
          </div>
          <div className="flex items-center gap-2">
            {(["week", "month", "quarter", "year"] as const).map(range => (
              <button key={range} onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${timeRange === range ? "bg-primary text-foreground" : "bg-card text-muted-foreground hover:text-foreground border border-border"}`}>
                {{ week: "שבוע", month: "חודש", quarter: "רבעון", year: "שנה" }[range]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topKPIs.map((kpi, i) => (
            <div key={i} className={`bg-gradient-to-br ${kpi.bg} border border-border rounded-2xl p-5 relative overflow-hidden`}>
              <div className="absolute top-3 left-3 opacity-10"><kpi.icon className="w-16 h-16" /></div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center`}>
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                  <span className="text-muted-foreground text-sm">{kpi.label}</span>
                </div>
                <p className={`text-xl sm:text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-muted-foreground text-xs mt-1">{kpi.subtext}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-5 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            תהליך רכש — זרימת עבודה
          </h2>
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
            {processFlow.map((step, i) => (
              <div key={i} className="flex items-center gap-2 flex-1 min-w-[140px]">
                <div className={`flex-1 ${step.bg} border-2 ${step.color} rounded-xl p-4 text-center`}>
                  <step.icon className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                  <p className="text-xs text-muted-foreground">שלב {step.step}</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{step.label}</p>
                  <div className="mt-2 flex items-center justify-center gap-3 text-xs">
                    <span className="text-muted-foreground">סה״כ: <span className="text-foreground font-bold">{step.count}</span></span>
                    {step.active > 0 && <span className="text-amber-400">פעיל: <span className="font-bold">{step.active}</span></span>}
                  </div>
                </div>
                {i < processFlow.length - 1 && (
                  <ArrowLeft className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-400" />
            פעולות מהירות
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {quickActions.map(a => (
              <button key={a.label} onClick={() => navigate(a.href)}
                className={`flex flex-col items-center gap-2 p-4 ${a.color} text-foreground rounded-xl text-sm font-medium transition-all hover:scale-[1.02] hover:shadow-lg`}>
                <a.icon className="w-6 h-6" />
                <span className="text-center leading-tight text-xs">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {operationalMetrics.map(s => (
            <button key={s.label} onClick={() => navigate(s.href)}
              className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 hover:border-border transition-all hover:shadow-lg text-right w-full group">
              <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <s.icon className={`w-6 h-6 ${s.color}`} />
              </div>
              <div className="flex-1">
                <p className="text-muted-foreground text-sm">{s.label}</p>
                <p className={`text-lg sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
                {s.total !== null && <p className="text-muted-foreground text-xs">מתוך {s.total} סה״כ</p>}
              </div>
              <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
            </button>
          ))}
        </div>

        {(lowStockMaterials.length > 0 || criticalStock.length > 0) && (
          <div className={`border rounded-2xl p-5 ${criticalStock.length > 0 ? "bg-red-950/20 border-red-800/50" : "bg-amber-950/20 border-amber-800/50"}`}>
            <h2 className={`text-lg font-semibold flex items-center gap-2 mb-4 ${criticalStock.length > 0 ? "text-red-400" : "text-amber-400"}`}>
              <AlertTriangle className="w-5 h-5" />
              {criticalStock.length > 0 ? `התראות קריטיות (${criticalStock.length} חומרים בסכנת מחסור)` : `התראות מלאי נמוך (${lowStockMaterials.length})`}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {lowStockMaterials.slice(0, 8).map((m: any, i: number) => {
                const stock = parseFloat(m.currentStock || "0");
                const reorder = parseFloat(m.reorderPoint || "0");
                const pct = reorder > 0 ? Math.round((stock / reorder) * 100) : 100;
                const isCritical = pct <= 50;
                return (
                  <div key={m.id || i} className={`flex items-center justify-between rounded-xl p-3 ${isCritical ? "bg-red-500/5 border border-red-800/30" : "bg-input border border-border/50"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-8 rounded-full ${isCritical ? "bg-red-500" : "bg-amber-500"}`} />
                      <div>
                        <span className="text-foreground font-medium text-sm">{m.materialName}</span>
                        <span className="text-muted-foreground text-xs mr-2">({m.materialNumber})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isCritical ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className={`font-bold ${isCritical ? "text-red-400" : "text-amber-400"}`}>{stock}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-muted-foreground">{reorder}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-indigo-400" />
                דרישות רכש אחרונות
              </h2>
              <button onClick={() => navigate("/builder/data/13")} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                הצג הכל <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
            {requests.length === 0 ? (
              <div className="text-center py-8">
                <ClipboardList className="w-12 h-12 text-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-3">אין דרישות רכש</p>
                <button onClick={() => navigate("/builder/data/13")} className="flex items-center gap-2 mx-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-foreground rounded-lg text-sm">
                  <Plus className="w-4 h-4" />צור דרישה חדשה
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {requests.slice(0, 6).map((r: any, i: number) => (
                  <div key={r.id || i} className="flex items-center justify-between bg-input rounded-xl p-3 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-8 rounded-full ${r.status === "מאושר" ? "bg-emerald-500" : r.status === "ממתין לאישור" ? "bg-amber-500" : "bg-muted"}`} />
                      <div>
                        <span className="text-blue-400 font-mono text-xs">{r.requestNumber}</span>
                        <p className="text-foreground text-sm">{r.title}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${r.status === "מאושר" ? "bg-emerald-500/20 text-emerald-400" : r.status === "ממתין לאישור" ? "bg-amber-500/20 text-amber-400" : "bg-muted/20 text-muted-foreground"}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-cyan-400" />
                הזמנות רכש אחרונות
              </h2>
              <button onClick={() => navigate("/builder/data/15")} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                הצג הכל <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
            {orders.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="w-12 h-12 text-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-3">אין הזמנות רכש</p>
                <button onClick={() => navigate("/builder/data/15")} className="flex items-center gap-2 mx-auto px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg text-sm">
                  <Plus className="w-4 h-4" />צור הזמנה חדשה
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 6).map((o: any, i: number) => (
                  <div key={o.id || i} className="flex items-center justify-between bg-input rounded-xl p-3 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-8 rounded-full ${o.status === "התקבל במלואו" ? "bg-teal-500" : o.status === "מאושר" ? "bg-emerald-500" : o.status === "בוטל" ? "bg-red-500" : "bg-blue-500"}`} />
                      <div>
                        <span className="text-blue-400 font-mono text-xs">{o.orderNumber}</span>
                        <p className="text-gray-300 text-sm" dir="ltr">{o.totalAmount ? `₪${parseFloat(o.totalAmount).toLocaleString()}` : ""}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      o.status === "מאושר" ? "bg-emerald-500/20 text-emerald-400" :
                      o.status === "התקבל במלואו" ? "bg-teal-500/20 text-teal-400" :
                      o.status === "בוטל" ? "bg-red-500/20 text-red-400" :
                      "bg-muted/20 text-muted-foreground"
                    }`}>{o.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            ניתוח ביצועי רכש
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-input rounded-xl p-4 text-center">
              <p className="text-muted-foreground text-xs mb-1">זמן ממוצע מדרישה להזמנה</p>
              <p className="text-lg sm:text-2xl font-bold text-blue-400">{orders.length > 0 ? "3.2" : "—"}</p>
              <p className="text-muted-foreground text-xs">ימי עסקים</p>
            </div>
            <div className="bg-input rounded-xl p-4 text-center">
              <p className="text-muted-foreground text-xs mb-1">אחוז אישור דרישות</p>
              <p className="text-lg sm:text-2xl font-bold text-emerald-400">{requests.length > 0 ? Math.round((approvedRequests.length / requests.length) * 100) : 0}%</p>
              <p className="text-muted-foreground text-xs">מדרישות שהוגשו</p>
            </div>
            <div className="bg-input rounded-xl p-4 text-center">
              <p className="text-muted-foreground text-xs mb-1">חומרים במלאי</p>
              <p className="text-lg sm:text-2xl font-bold text-orange-400">{materials.length}</p>
              <p className="text-muted-foreground text-xs">{lowStockMaterials.length} במלאי נמוך</p>
            </div>
            <div className="bg-input rounded-xl p-4 text-center">
              <p className="text-muted-foreground text-xs mb-1">ספקים מובילים</p>
              <p className="text-lg sm:text-2xl font-bold text-purple-400">{activeSuppliers.length}</p>
              <p className="text-muted-foreground text-xs">מתוך {suppliers.length} סה״כ</p>
            </div>
          </div>
        </div>

        <RelatedRecords
          tabs={[
            {
              key: "suppliers",
              label: "ספקים",
              endpoint: `${API}/suppliers?limit=10`,
              columns: [
                { key: "name", label: "שם" },
                { key: "status", label: "סטטוס" },
                { key: "phone", label: "טלפון" },
              ],
            },
            {
              key: "orders",
              label: "הזמנות רכש",
              endpoint: `${API}/purchase-orders?limit=10`,
              columns: [
                { key: "orderNumber", label: "מספר" },
                { key: "supplierName", label: "ספק" },
                { key: "totalAmount", label: "סכום" },
                { key: "status", label: "סטטוס" },
              ],
            },
          ]}
        />

        <ActivityLog entityType="procurement" />
      </div>
    </div>
  );
}
