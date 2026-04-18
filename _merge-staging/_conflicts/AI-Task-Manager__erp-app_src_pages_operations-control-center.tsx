import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft,
  Bell, Lightbulb, Repeat2, Wrench, ClipboardList, Activity,
  Server, Building2, Users, Shield, BarChart3, Zap, Circle,
  Database, Layers, Factory, ShoppingCart, Truck, Package,
  Boxes, Wallet, DollarSign, Clock, Target, TrendingUp,
  Plus, ExternalLink, FileText, Hammer, Settings, CheckSquare,
  ArrowUpRight, ArrowDownRight, Receipt, CreditCard, MapPin,
  CheckCheck,
} from "lucide-react";

import { usePlatformModules } from "@/hooks/usePlatformModules";
import { useCustomers } from "@/hooks/useCustomers";

const API = "/api";

function authHeaders() {
  const token = localStorage.getItem("erp_token") || "";
  return { Authorization: `Bearer ${token}` };
}

async function authFetch(url: string) {
  try {
    return await fetch(url, { headers: authHeaders() });
  } catch {
    return new Response(JSON.stringify([]), { status: 500 });
  }
}

function safeArray(d: any): any[] {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    if (Array.isArray(d.data)) return d.data;
    return d.items || d.rows || d.employees || d.orders || d.expenses || d.notifications || [];
  }
  return [];
}

function NavButton({ label, icon: Icon, href, color, onNavigate }: {
  label: string; icon: any; href: string; color: string; onNavigate: (p: string) => void;
}) {
  return (
    <button onClick={() => onNavigate(href)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${color}`}>
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      <ChevronLeft className="w-3 h-3 mr-auto opacity-50" />
    </button>
  );
}

const moduleRouteMap: Record<string, string> = {
  dashboard: "/",
  sales: "/sales/orders",
  procurement: "/purchase-orders",
  inventory: "/raw-materials",
  production: "/work-orders",
  finance: "/finance",
  hr: "/hr/employees",
  crm: "/crm",
  "crm-advanced": "/crm",
  projects: "/projects",
  settings: "/settings",
  meetings: "/meetings",
  approvals: "/platform/approval-chains",
  "field-measurements": "/field-measurements",
  imports: "/import-management",
  installers: "/hr/employees",
  customers: "/sales/customers",
  suppliers: "/suppliers",
  documents: "/documents",
  "document-control": "/documents",
  dms: "/documents",
  clm: "/contracts",
  esign: "/documents",
  strategy: "/builder",
  "market-analysis": "/builder",
  marketing: "/crm",
  "cost-reduction": "/finance/expenses",
  "crisis-management": "/builder",
  "product-development": "/products",
  "quality-control": "/quality-control",
  maintenance: "/maintenance",
  safety: "/safety-management",
  "asset-management": "/asset-management",
  "hi-tech": "/hi-tech-dashboard",
};

export default function OperationsControlCenter() {
  const [, navigate] = useLocation();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: kpis } = useQuery<any>({
    queryKey: ["ops-kpis"],
    queryFn: async () => {
      const r = await authFetch(`${API}/dashboard/kpis`);
      return r.ok ? r.json() : null;
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: health } = useQuery<any>({
    queryKey: ["ops-health"],
    queryFn: async () => {
      const r = await authFetch(`${API}/healthz`);
      return r.ok ? r.json() : { status: "degraded", checks: {} };
    },
    staleTime: 30000,
    refetchInterval: 120000,
  });

  const { modules } = usePlatformModules();

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["ops-employees"],
    queryFn: async () => {
      const r = await authFetch(`${API}/hr/employees?limit=9999`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.employees || safeArray(d);
    },
  });

  const { data: salesOrders = [] } = useQuery<any[]>({
    queryKey: ["ops-sales"],
    queryFn: async () => {
      const r = await authFetch(`${API}/sales/orders`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: workOrders = [] } = useQuery<any[]>({
    queryKey: ["ops-work-orders"],
    queryFn: async () => {
      const r = await authFetch(`${API}/work-orders`);
      if (!r.ok) return [];
      const d = await r.json();
      return safeArray(d);
    },
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["ops-suppliers"],
    queryFn: async () => {
      const r = await authFetch(`${API}/suppliers`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["ops-expenses"],
    queryFn: async () => {
      const r = await authFetch(`${API}/finance/expenses?limit=500`);
      if (!r.ok) return [];
      const d = await r.json();
      return safeArray(d);
    },
  });

  const { data: rawMaterials = [] } = useQuery<any[]>({
    queryKey: ["ops-materials"],
    queryFn: async () => {
      const r = await authFetch(`${API}/raw-materials`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["ops-products"],
    queryFn: async () => {
      const r = await authFetch(`${API}/products`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { customers } = useCustomers();

  const { data: notifStats, refetch: refetchNotifStats } = useQuery<any>({
    queryKey: ["ops-notif-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API}/notifications/stats`);
      return r.ok ? r.json() : { unread: 0, critical: 0 };
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: notificationsList = [] } = useQuery<any[]>({
    queryKey: ["ops-notifications-list"],
    queryFn: async () => {
      const r = await authFetch(`${API}/notifications?limit=20&isRead=false`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.notifications || safeArray(d);
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  async function markNotificationRead(id: number, link?: string) {
    try {
      await fetch(`${API}/notifications/${id}/read`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      queryClient.invalidateQueries({ queryKey: ["ops-notif-stats"] });
      queryClient.invalidateQueries({ queryKey: ["ops-notifications-list"] });
      if (link) {
        setOpenDropdown(null);
        navigate(link);
      }
    } catch {
      // silent
    }
  }

  async function markAllRead() {
    try {
      await fetch(`${API}/notifications/mark-all-read`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      queryClient.invalidateQueries({ queryKey: ["ops-notif-stats"] });
      queryClient.invalidateQueries({ queryKey: ["ops-notifications-list"] });
    } catch {
      // silent
    }
  }

  const isDbOk = health?.checks?.database?.startsWith("ok") ?? true;
  const memStr = health?.checks?.memory || "—";
  const uptimeStr = health?.checks?.uptime || "—";
  const systemStatus = health?.status || "ok";

  const totalSalesValue = salesOrders.reduce((s: number, o: any) =>
    s + (Number(o.total) || Number(o.total_amount) || Number(o.grand_total) || 0), 0);
  const totalExpensesValue = expenses.reduce((s: number, e: any) =>
    s + (Number(e.amount) || Number(e.total_amount) || Number(e.total_with_vat) || 0), 0);

  const WO_STATUSES_IN_PROGRESS = ["in_progress", "in_production", "בביצוע"];
  const WO_STATUSES_COMPLETED = ["completed", "delivered", "ready", "הושלם"];
  const WO_STATUSES_PLANNED = ["planned", "pending", "מתוכנן", "חדש"];
  const WO_STATUSES_ON_HOLD = ["on_hold", "quality_check", "מושהה"];

  const woCompleted = workOrders.filter((w: any) => WO_STATUSES_COMPLETED.includes(w.status)).length;
  const woInProgress = workOrders.filter((w: any) => WO_STATUSES_IN_PROGRESS.includes(w.status)).length;
  const woPlanned = workOrders.filter((w: any) => WO_STATUSES_PLANNED.includes(w.status)).length;
  const woOnHold = workOrders.filter((w: any) => WO_STATUSES_ON_HOLD.includes(w.status)).length;

  const lowStockMaterials = rawMaterials.filter((m: any) => {
    const stock = Number(m.currentStock || m.current_stock || 0);
    const reorder = Number(m.reorderPoint || m.reorder_point || 0);
    return reorder > 0 && stock <= reorder;
  });

  const deptMap = new Map<string, number>();
  employees.forEach((emp: any) => {
    const data = emp.data || emp;
    const dept = data.department || "כללי";
    deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
  });
  const departments = Array.from(deptMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const publishedModules = modules.filter((m: any) => m.status === "published");
  const activeModulesCount = publishedModules.length || modules.length;

  const CATEGORY_META = [
    { key: "production", label: "ייצור", icon: Factory, color: "bg-orange-500", textColor: "text-orange-400", borderColor: "border-orange-500/30", bgColor: "bg-orange-500/10" },
    { key: "sales", label: "מכירות", icon: ShoppingCart, color: "bg-blue-500", textColor: "text-blue-400", borderColor: "border-blue-500/30", bgColor: "bg-blue-500/10" },
    { key: "hr", label: "עובדים", icon: Users, color: "bg-emerald-500", textColor: "text-emerald-400", borderColor: "border-emerald-500/30", bgColor: "bg-emerald-500/10" },
    { key: "inventory", label: "מלאי", icon: Boxes, color: "bg-amber-500", textColor: "text-amber-400", borderColor: "border-amber-500/30", bgColor: "bg-amber-500/10" },
    { key: "finance", label: "כספים", icon: Wallet, color: "bg-purple-500", textColor: "text-purple-400", borderColor: "border-purple-500/30", bgColor: "bg-purple-500/10" },
    { key: "alerts", label: "התראות", icon: Bell, color: "bg-red-500", textColor: "text-red-400", borderColor: "border-red-500/30", bgColor: "bg-red-500/10" },
  ];

  const categoryCounts: Record<string, number> = {
    production: workOrders.length,
    sales: salesOrders.length,
    hr: employees.length,
    inventory: rawMaterials.length,
    finance: expenses.length,
    alerts: notifStats?.unread || 0,
  };

  const categoryDetails: Record<string, Array<{ label: string; severity: string; count: number; href?: string }>> = {
    production: [
      { label: `${workOrders.length} הוראות עבודה`, severity: "info", count: workOrders.length, href: "/work-orders" },
      { label: `${woInProgress} בביצוע כעת`, severity: woInProgress > 0 ? "warning" : "info", count: woInProgress, href: "/work-orders" },
      { label: `${woCompleted} הושלמו`, severity: "info", count: woCompleted },
      { label: `${woPlanned} מתוכננות`, severity: "info", count: woPlanned },
      ...(woOnHold > 0 ? [{ label: `${woOnHold} מושהות`, severity: "warning" as const, count: woOnHold }] : []),
    ],
    sales: [
      { label: `${salesOrders.length} הזמנות מכירה`, severity: "info", count: salesOrders.length, href: "/sales/orders" },
      { label: `ערך כולל: ₪${totalSalesValue.toLocaleString("he-IL")}`, severity: "info", count: 1 },
      { label: `${customers.length} לקוחות פעילים`, severity: "info", count: customers.length, href: "/sales/customers" },
    ],
    hr: [
      { label: `${employees.length} עובדים פעילים`, severity: "info", count: employees.length, href: "/hr/employees" },
      { label: `${departments.length} מחלקות`, severity: "info", count: departments.length },
      ...(departments.slice(0, 3).map(d => ({ label: `${d.name}: ${d.count} עובדים`, severity: "info" as const, count: d.count }))),
    ],
    inventory: [
      { label: `${rawMaterials.length} חומרי גלם`, severity: "info", count: rawMaterials.length, href: "/raw-materials" },
      { label: `${products.length} מוצרים`, severity: "info", count: products.length, href: "/products" },
      { label: `${suppliers.length} ספקים פעילים`, severity: "info", count: suppliers.length, href: "/suppliers" },
      ...(lowStockMaterials.length > 0 ? [{ label: `${lowStockMaterials.length} פריטים במלאי נמוך!`, severity: "warning" as const, count: lowStockMaterials.length, href: "/raw-materials" }] : []),
    ],
    finance: [
      { label: `הוצאות: ₪${totalExpensesValue.toLocaleString("he-IL")}`, severity: "info", count: expenses.length, href: "/finance/expenses" },
      { label: `${expenses.length} רשומות הוצאה`, severity: "info", count: expenses.length },
      { label: `מכירות: ₪${totalSalesValue.toLocaleString("he-IL")}`, severity: "info", count: 1 },
      ...(totalSalesValue > totalExpensesValue ? [{ label: `רווח תפעולי: ₪${(totalSalesValue - totalExpensesValue).toLocaleString("he-IL")}`, severity: "info" as const, count: 1 }] : []),
    ],
    alerts: [
      { label: `${notifStats?.unread || 0} התראות לא נקראו`, severity: notifStats?.unread > 0 ? "warning" : "info", count: notifStats?.unread || 0 },
      { label: `${notifStats?.critical || 0} קריטיות`, severity: notifStats?.critical > 0 ? "critical" : "info", count: notifStats?.critical || 0 },
      ...(lowStockMaterials.length > 0 ? [{ label: `${lowStockMaterials.length} התראות מלאי נמוך`, severity: "warning" as const, count: lowStockMaterials.length }] : []),
      ...(!isDbOk ? [{ label: "שגיאה בחיבור ל-Database", severity: "critical" as const, count: 1 }] : []),
    ],
  };

  return (
    <div className="min-h-screen p-4 sm:p-6" dir="rtl">
      <div className="space-y-4 max-w-6xl mx-auto">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">מרכז בקרה ותפעול</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              ניטור מערכת בזמן אמת — טכנו-כל עוזי · {activeModulesCount} מודולים · {employees.length} עובדים · {uptimeStr} פעילות
            </p>
          </div>
          <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm bg-card border rounded-lg px-3 py-1.5 hover:bg-accent transition-colors">
            דשבורד
          </button>
        </div>

        <div className="relative bg-card border border-border rounded-2xl overflow-visible">
          <div className="flex items-stretch divide-x divide-x-reverse divide-border overflow-x-auto">
            {CATEGORY_META.map((cat) => {
              const Icon = cat.icon;
              const count = categoryCounts[cat.key] ?? 0;
              const isOpen = openDropdown === cat.key;
              return (
                <div key={cat.key} className="relative flex-1 min-w-[100px]">
                  <button
                    onClick={() => setOpenDropdown(prev => (prev === cat.key ? null : cat.key))}
                    className={`w-full flex flex-col items-center gap-2 px-3 py-4 hover:bg-muted/40 transition-colors ${isOpen ? "bg-muted/50" : ""}`}
                  >
                    <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center ${cat.bgColor} border ${cat.borderColor}`}>
                      <Icon className={`w-5 h-5 ${cat.textColor}`} />
                      {count > 0 && (
                        <span className={`absolute -top-2 -left-2 min-w-[20px] h-5 flex items-center justify-center text-[11px] font-bold text-foreground rounded-full px-1 ${cat.color}`}>
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-foreground">{cat.label}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {isOpen && cat.key !== "alerts" && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute top-full right-0 z-30 w-80 bg-popover border border-border rounded-xl shadow-xl mt-1 overflow-hidden"
                      >
                        <div className={`px-4 py-2.5 border-b border-border ${cat.bgColor}`}>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${cat.textColor}`} />
                            <span className="text-sm font-semibold">{cat.label}</span>
                            <span className={`mr-auto text-xs font-bold px-2 py-0.5 rounded-full text-foreground ${cat.color}`}>{count}</span>
                          </div>
                        </div>
                        <div className="p-2 space-y-1">
                          {(categoryDetails[cat.key] || []).map((item, i) => (
                            <button key={i}
                              onClick={() => item.href && navigate(item.href)}
                              className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-right transition-colors ${
                                item.href ? "cursor-pointer hover:bg-accent" : ""
                              } ${
                                item.severity === "critical" ? "bg-red-500/10 border border-red-500/20" :
                                item.severity === "warning" ? "bg-yellow-500/10 border border-yellow-500/20" :
                                "bg-muted/50 border border-border"
                              }`}>
                              <Circle className={`w-2 h-2 mt-1.5 flex-shrink-0 fill-current ${
                                item.severity === "critical" ? "text-red-400" : item.severity === "warning" ? "text-yellow-400" : "text-blue-400"
                              }`} />
                              <span className="text-sm text-foreground leading-snug flex-1">{item.label}</span>
                              {item.href && <ChevronLeft className="w-3 h-3 text-muted-foreground mt-1 flex-shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {isOpen && cat.key === "alerts" && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute top-full right-0 z-30 w-96 bg-popover border border-border rounded-xl shadow-xl mt-1 overflow-hidden"
                      >
                        <div className={`px-4 py-2.5 border-b border-border ${cat.bgColor} flex items-center gap-2`}>
                          <Bell className={`w-4 h-4 ${cat.textColor}`} />
                          <span className="text-sm font-semibold">התראות</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-foreground ${cat.color}`}>{notifStats?.unread || 0}</span>
                          {(notifStats?.unread || 0) > 0 && (
                            <button
                              onClick={markAllRead}
                              className="mr-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                            >
                              <CheckCheck className="w-3 h-3" />
                              סמן הכל כנקרא
                            </button>
                          )}
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                          {notificationsList.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground text-sm">
                              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-60" />
                              אין התראות חדשות
                            </div>
                          ) : (
                            <div className="p-2 space-y-1">
                              {notificationsList.map((notif: any) => (
                                <button
                                  key={notif.id}
                                  onClick={() => markNotificationRead(notif.id, notif.link || notif.actionUrl)}
                                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-right transition-colors cursor-pointer hover:bg-accent border ${
                                    notif.priority === "critical" || notif.priority === "urgent"
                                      ? "bg-red-500/10 border-red-500/20"
                                      : notif.priority === "high"
                                      ? "bg-yellow-500/10 border-yellow-500/20"
                                      : "bg-muted/50 border-border"
                                  }`}
                                >
                                  <Circle className={`w-2 h-2 mt-1.5 flex-shrink-0 fill-current ${
                                    notif.priority === "critical" || notif.priority === "urgent" ? "text-red-400" :
                                    notif.priority === "high" ? "text-yellow-400" : "text-blue-400"
                                  }`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-foreground leading-snug truncate">{notif.title}</div>
                                    {notif.message && (
                                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</div>
                                    )}
                                  </div>
                                  <ChevronLeft className="w-3 h-3 text-muted-foreground mt-1 flex-shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="border-t border-border p-2">
                          <button
                            onClick={() => { setOpenDropdown(null); navigate("/notifications"); }}
                            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1.5 hover:bg-accent rounded transition-colors"
                          >
                            הצג את כל ההתראות
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "עובדים", value: employees.length, icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", href: "/hr/employees" },
            { label: "הזמנות מכירה", value: salesOrders.length, icon: ShoppingCart, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", href: "/sales/orders" },
            { label: "הוראות עבודה", value: workOrders.length, icon: Factory, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", href: "/work-orders" },
            { label: "חומרי גלם", value: rawMaterials.length, icon: Boxes, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", href: "/raw-materials" },
            { label: "לקוחות", value: customers.length, icon: Building2, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/30", href: "/sales/customers" },
            { label: "ספקים", value: suppliers.length, icon: Truck, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", href: "/suppliers" },
          ].map((card, i) => {
            const Icon = card.icon;
            return (
              <button key={i} onClick={() => navigate(card.href)}
                className={`rounded-xl border p-3 text-right transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer ${card.bg}`}>
                <Icon className={`w-5 h-5 ${card.color} mb-1`} />
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-xs opacity-80 mt-0.5">{card.label}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <div className="lg:col-span-2 space-y-4">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div className="bg-card border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Factory className="w-5 h-5 text-orange-400" />
                    <h3 className="font-bold">סטטוס ייצור</h3>
                  </div>
                  <button onClick={() => navigate("/work-orders")} className="text-xs text-orange-400 hover:underline flex items-center gap-1">
                    הוראות עבודה <ChevronLeft className="w-3 h-3" />
                  </button>
                </div>
                {workOrders.length === 0 ? (
                  <div className="text-center py-6">
                    <Factory className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground mb-3">אין הוראות עבודה במערכת</p>
                    <button
                      onClick={() => navigate("/work-orders")}
                      className="text-xs px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
                    >
                      צור הוראת עבודה ראשונה
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-400" /> בביצוע</span>
                      <span className="font-bold text-blue-400 text-lg">{woInProgress}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-amber-400" /> מתוכנן / ממתין</span>
                      <span className="font-bold text-amber-400 text-lg">{woPlanned}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> הושלם / נמסר</span>
                      <span className="font-bold text-emerald-400 text-lg">{woCompleted}</span>
                    </div>
                    {woOnHold > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-400" /> בבקרת איכות</span>
                        <span className="font-bold text-red-400 text-lg">{woOnHold}</span>
                      </div>
                    )}
                    <div className="h-3 rounded-full bg-muted overflow-hidden flex mt-2">
                      {workOrders.length > 0 && (
                        <>
                          <div className="h-full bg-emerald-500" style={{ width: `${(woCompleted / workOrders.length) * 100}%` }} />
                          <div className="h-full bg-blue-500" style={{ width: `${(woInProgress / workOrders.length) * 100}%` }} />
                          <div className="h-full bg-amber-500" style={{ width: `${(woPlanned / workOrders.length) * 100}%` }} />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-card border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold">סיכום כספי</h3>
                  </div>
                  <button onClick={() => navigate("/finance/expenses")} className="text-xs text-emerald-400 hover:underline flex items-center gap-1">
                    כספים <ChevronLeft className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="text-xs text-muted-foreground">סה״כ מכירות</div>
                    <div className="text-xl font-bold text-emerald-400">₪{totalSalesValue.toLocaleString("he-IL")}</div>
                    <div className="text-xs text-muted-foreground">{salesOrders.length} הזמנות</div>
                  </div>
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                    <div className="text-xs text-muted-foreground">סה״כ הוצאות</div>
                    <div className="text-xl font-bold text-rose-400">₪{totalExpensesValue.toLocaleString("he-IL")}</div>
                    <div className="text-xs text-muted-foreground">{expenses.length} רשומות</div>
                  </div>
                  {totalSalesValue > 0 && totalExpensesValue > 0 && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                      <div className="text-xs text-muted-foreground">רווח תפעולי משוער</div>
                      <div className={`text-xl font-bold ${totalSalesValue > totalExpensesValue ? "text-emerald-400" : "text-rose-400"}`}>
                        ₪{(totalSalesValue - totalExpensesValue).toLocaleString("he-IL")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {workOrders.length > 0 && (
              <div className="bg-card border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-orange-400" />
                    <h3 className="font-bold">הוראות עבודה אחרונות</h3>
                  </div>
                  <button onClick={() => navigate("/work-orders")} className="text-xs text-orange-400 hover:underline flex items-center gap-1">
                    הצג הכל <ChevronLeft className="w-3 h-3" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-muted-foreground text-xs">
                        <th className="text-right py-2 px-2">מס׳</th>
                        <th className="text-right py-2 px-2">תיאור</th>
                        <th className="text-right py-2 px-2">מחלקה</th>
                        <th className="text-right py-2 px-2">עדיפות</th>
                        <th className="text-right py-2 px-2">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workOrders.slice(0, 6).map((wo: any, i: number) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-accent/30 cursor-pointer transition-colors"
                          onClick={() => navigate("/work-orders")}>
                          <td className="py-2 px-2 font-mono text-orange-400 text-xs">{wo.order_number}</td>
                          <td className="py-2 px-2 max-w-[180px] truncate">{wo.product_name || wo.title || wo.description}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{wo.department || "-"}</td>
                          <td className="py-2 px-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              wo.priority === "urgent" ? "bg-red-500/20 text-red-400" :
                              wo.priority === "high" ? "bg-orange-500/20 text-orange-400" :
                              "bg-muted/20 text-muted-foreground"
                            }`}>
                              {wo.priority === "urgent" ? "דחוף" : wo.priority === "high" ? "גבוה" :
                               wo.priority === "normal" ? "רגיל" : wo.priority === "low" ? "נמוך" : wo.priority || "רגיל"}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              WO_STATUSES_COMPLETED.includes(wo.status) ? "bg-emerald-500/20 text-emerald-400" :
                              WO_STATUSES_IN_PROGRESS.includes(wo.status) ? "bg-blue-500/20 text-blue-400" :
                              WO_STATUSES_PLANNED.includes(wo.status) ? "bg-amber-500/20 text-amber-400" :
                              "bg-purple-500/20 text-purple-400"
                            }`}>
                              {WO_STATUSES_COMPLETED.includes(wo.status) ? "הושלם" :
                               WO_STATUSES_IN_PROGRESS.includes(wo.status) ? "בביצוע" :
                               WO_STATUSES_PLANNED.includes(wo.status) ? "ממתין" :
                               wo.status === "quality_check" ? "בקרת איכות" : wo.status || "חדש"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {salesOrders.length > 0 && (
              <div className="bg-card border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-blue-400" />
                    <h3 className="font-bold">הזמנות מכירה אחרונות</h3>
                  </div>
                  <button onClick={() => navigate("/sales/orders")} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                    הצג הכל <ChevronLeft className="w-3 h-3" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-muted-foreground text-xs">
                        <th className="text-right py-2 px-2">מס׳ הזמנה</th>
                        <th className="text-right py-2 px-2">לקוח</th>
                        <th className="text-right py-2 px-2">סכום</th>
                        <th className="text-right py-2 px-2">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesOrders.slice(0, 5).map((order: any, i: number) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-accent/30 cursor-pointer transition-colors"
                          onClick={() => navigate("/sales/orders")}>
                          <td className="py-2 px-2 font-mono text-blue-400 text-xs">{order.order_number}</td>
                          <td className="py-2 px-2">{order.customer_name}</td>
                          <td className="py-2 px-2 font-bold">₪{Number(order.total || order.total_amount || order.grand_total || 0).toLocaleString("he-IL")}</td>
                          <td className="py-2 px-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              order.status === "completed" || order.status === "delivered" ? "bg-emerald-500/20 text-emerald-400" :
                              order.status === "in_progress" || order.status === "confirmed" ? "bg-blue-500/20 text-blue-400" :
                              "bg-amber-500/20 text-amber-400"
                            }`}>
                              {order.status === "completed" || order.status === "delivered" ? "הושלם" :
                               order.status === "in_progress" || order.status === "confirmed" ? "מאושר" :
                               order.status === "draft" ? "טיוטה" : order.status || "חדש"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">מצב מערכת</h3>
                  <span className={`mr-auto text-xs font-bold px-2 py-0.5 rounded-full ${isDbOk ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                    {isDbOk ? "תקין" : "שגיאה"}
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">בסיס נתונים</span>
                  <span className={`font-semibold ${isDbOk ? "text-green-400" : "text-red-400"}`}>
                    {isDbOk ? "תקין" : "שגיאה"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">זיכרון</span>
                  <span className="font-semibold text-foreground">{memStr}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">זמן פעילות</span>
                  <span className="font-semibold text-foreground">{uptimeStr}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">מודולים פעילים</span>
                  <span className="font-semibold text-foreground">{activeModulesCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">התראות לא נקראו</span>
                  <span className="font-semibold text-foreground">{notifStats?.unread ?? 0}</span>
                </div>
              </div>
            </div>

            {departments.length > 0 && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">עובדים לפי מחלקה</h3>
                    <span className="mr-auto text-xs text-muted-foreground">{employees.length} עובדים</span>
                  </div>
                </div>
                <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                  {departments.slice(0, 10).map((dept, i) => {
                    const pct = Math.round((dept.count / employees.length) * 100);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs w-20 text-right truncate shrink-0">{dept.name}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-l from-blue-500 to-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs w-10 text-left text-muted-foreground shrink-0">{dept.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">מודולים</h3>
                  <span className="mr-auto text-xs text-muted-foreground">{modules.length}</span>
                </div>
              </div>
              <div className="divide-y divide-border max-h-80 overflow-y-auto">
                {modules.map((mod: any) => {
                  const route = moduleRouteMap[mod.slug] || `/${mod.slug}`;
                  return (
                    <button key={mod.id} onClick={() => navigate(route)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-right">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                      <span className="text-sm flex-1 truncate">{mod.name}</span>
                      <ChevronLeft className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-gradient-to-l from-blue-500/5 to-purple-500/5 border border-blue-500/20 rounded-2xl p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" /> ניווט מהיר
              </h3>
              <div className="space-y-1">
                <NavButton label="הוראות עבודה" icon={Factory} href="/work-orders" color="hover:bg-orange-500/10 text-orange-400" onNavigate={navigate} />
                <NavButton label="הזמנות מכירה" icon={ShoppingCart} href="/sales/orders" color="hover:bg-blue-500/10 text-blue-400" onNavigate={navigate} />
                <NavButton label="עובדים" icon={Users} href="/hr/employees" color="hover:bg-emerald-500/10 text-emerald-400" onNavigate={navigate} />
                <NavButton label="חומרי גלם" icon={Boxes} href="/raw-materials" color="hover:bg-amber-500/10 text-amber-400" onNavigate={navigate} />
                <NavButton label="הוצאות" icon={Wallet} href="/finance/expenses" color="hover:bg-purple-500/10 text-purple-400" onNavigate={navigate} />
                <NavButton label="ספקים" icon={Truck} href="/suppliers" color="hover:bg-cyan-500/10 text-cyan-400" onNavigate={navigate} />
                <NavButton label="לקוחות" icon={Building2} href="/sales/customers" color="hover:bg-blue-500/10 text-blue-400" onNavigate={navigate} />
                <NavButton label="הנהלת חשבונות" icon={Receipt} href="/finance/accounting-portal" color="hover:bg-rose-500/10 text-rose-400" onNavigate={navigate} />
                <NavButton label="דוח מצב החברה" icon={BarChart3} href="/documents/company-report" color="hover:bg-indigo-500/10 text-indigo-400" onNavigate={navigate} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
