import { useQuery } from "@tanstack/react-query";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import { useCustomers } from "@/hooks/useCustomers";
import { useLocation } from "wouter";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  Building2, Users, Package, FileText, Truck, Factory, Wallet,
  ClipboardList, Database, TrendingUp, Boxes, ShoppingCart, BarChart3,
  Plus, ArrowLeft, Briefcase, Receipt, CreditCard, Hammer, Layers,
  ChevronLeft, ExternalLink, DollarSign, AlertTriangle, CheckCircle2,
  Clock, Target, Wrench, BookOpen
} from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

function authFetch(url: string) {
  const token = localStorage.getItem("erp_token");
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

function safeArray(d: any): any[] {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    return d.data || d.items || d.rows || d.employees || d.orders || d.expenses || d.suppliers || d.products || d.materials || [];
  }
  return [];
}

function NavCard({ label, count, icon, href, color, onNavigate }: {
  label: string; count: number | string; icon: React.ReactNode;
  href: string; color: string; onNavigate: (path: string) => void;
}) {
  return (
    <button
      onClick={() => onNavigate(href)}
      className={`rounded-xl border p-4 text-right transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer ${color}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="opacity-70">{icon}</span>
        <ExternalLink className="w-3 h-3 opacity-40" />
      </div>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm opacity-80 mt-1">{label}</div>
    </button>
  );
}

export default function CompanyStatusDashboard() {
  const [, navigate] = useLocation();

  const { modules } = usePlatformModules();

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["report-entities"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/entities`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["report-employees"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/hr/employees?limit=9999`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.employees || safeArray(d);
    },
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["report-suppliers"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/suppliers`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { customers } = useCustomers();

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["report-products"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/products`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: salesOrders = [] } = useQuery<any[]>({
    queryKey: ["report-sales-orders"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/sales/orders`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: workOrders = [] } = useQuery<any[]>({
    queryKey: ["report-work-orders"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/work-orders`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["report-expenses"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/finance/expenses?limit=500`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.data || safeArray(d);
    },
  });

  const { data: rawMaterials = [] } = useQuery<any[]>({
    queryKey: ["report-raw-materials"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/raw-materials`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: journalEntries = [] } = useQuery<any[]>({
    queryKey: ["report-journal-entries"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/journal-entries`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: chartOfAccounts = [] } = useQuery<any[]>({
    queryKey: ["report-chart-of-accounts"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/chart-of-accounts`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const { data: priceQuotes = [] } = useQuery<any[]>({
    queryKey: ["report-price-quotes"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/price-quotes`);
      return r.ok ? safeArray(await r.json()) : [];
    },
  });

  const totalSalesValue = salesOrders.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
  const totalExpensesValue = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || Number(e.total_amount) || 0), 0);

  const deptMap = new Map<string, number>();
  employees.forEach((emp: any) => {
    const data = emp.data || emp;
    const dept = data.department || data.departmentName || "כללי";
    deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
  });
  const departments = Array.from(deptMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const woCompleted = workOrders.filter((w: any) => w.status === "completed" || w.status === "הושלם").length;
  const woInProgress = workOrders.filter((w: any) => w.status === "in_progress" || w.status === "בביצוע").length;
  const woPlanned = workOrders.filter((w: any) => w.status === "planned" || w.status === "מתוכנן" || w.status === "חדש").length;

  const now = new Date();
  const currentMonth = now.toLocaleDateString("he-IL", { month: "long", year: "numeric" });

  const moduleRouteMap: Record<string, string> = {
    inventory: "/raw-materials",
    suppliers: "/suppliers",
    procurement: "/purchase-orders",
    documents: "/documents",
    finance: "/finance",
    "crm-advanced": "/crm",
    installers: "/hr/employees",
    customers: "/sales/customers",
    hr: "/hr/employees",
    production: "/work-orders",
    sales: "/sales/orders",
    projects: "/projects",
    "field-measurements": "/field-measurements",
    meetings: "/meetings",
    approvals: "/approvals",
    imports: "/imports",
    "cost-reduction": "/cost-reduction",
    marketing: "/marketing",
    "market-analysis": "/market-analysis",
    strategy: "/strategy",
    "product-development": "/products",
    "crisis-management": "/crisis-management",
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto" dir="rtl">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">דוח מצב החברה</h1>
            <p className="text-sm text-muted-foreground">סקירה מלאה של נתוני המערכת — טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground bg-card border rounded-lg px-3 py-1.5">
            {currentMonth}
          </div>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm bg-card border rounded-lg px-3 py-1.5 hover:bg-accent transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            דשבורד
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <NavCard label="עובדים" count={employees.length} icon={<Users className="w-5 h-5" />}
          href="/hr/employees" color="bg-emerald-500/10 border-emerald-500/30 text-emerald-400" onNavigate={navigate} />
        <NavCard label="לקוחות" count={customers.length} icon={<Building2 className="w-5 h-5" />}
          href="/sales/customers" color="bg-blue-500/10 border-blue-500/30 text-blue-400" onNavigate={navigate} />
        <NavCard label="ספקים" count={suppliers.length} icon={<Truck className="w-5 h-5" />}
          href="/suppliers" color="bg-cyan-500/10 border-cyan-500/30 text-cyan-400" onNavigate={navigate} />
        <NavCard label="מוצרים" count={products.length} icon={<Package className="w-5 h-5" />}
          href="/products" color="bg-purple-500/10 border-purple-500/30 text-purple-400" onNavigate={navigate} />
        <NavCard label="חומרי גלם" count={rawMaterials.length} icon={<Boxes className="w-5 h-5" />}
          href="/raw-materials" color="bg-amber-500/10 border-amber-500/30 text-amber-400" onNavigate={navigate} />
        <NavCard label="מודולים" count={modules.length} icon={<Database className="w-5 h-5" />}
          href="/platform" color="bg-muted/10 border-slate-500/30 text-muted-foreground" onNavigate={navigate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold">מכירות</h2>
            </div>
            <button onClick={() => navigate("/sales/orders")}
              className="text-xs bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1">
              <Plus className="w-3 h-3" /> הזמנה חדשה
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">הזמנות מכירה</span>
              <span className="font-bold text-lg">{salesOrders.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">סה״כ ערך מכירות</span>
              <span className="font-bold text-emerald-400">₪{totalSalesValue.toLocaleString("he-IL")}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">הצעות מחיר</span>
              <span className="font-bold">{priceQuotes.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">לקוחות פעילים</span>
              <span className="font-bold">{customers.length}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex gap-2">
            <button onClick={() => navigate("/sales/orders")} className="text-xs text-blue-400 hover:underline">הזמנות →</button>
            <button onClick={() => navigate("/sales/quotations")} className="text-xs text-blue-400 hover:underline">הצעות מחיר →</button>
            <button onClick={() => navigate("/sales/customers")} className="text-xs text-blue-400 hover:underline">לקוחות →</button>
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-bold">ייצור</h2>
            </div>
            <button onClick={() => navigate("/work-orders")}
              className="text-xs bg-orange-500/20 text-orange-400 px-2.5 py-1 rounded-lg hover:bg-orange-500/30 transition-colors flex items-center gap-1">
              <Plus className="w-3 h-3" /> הוראת עבודה
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">הוראות עבודה</span>
              <span className="font-bold text-lg">{workOrders.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> הושלמו</span>
              <span className="font-bold text-emerald-400">{woCompleted}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm flex items-center gap-1"><Clock className="w-3 h-3 text-blue-400" /> בביצוע</span>
              <span className="font-bold text-blue-400">{woInProgress}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm flex items-center gap-1"><Target className="w-3 h-3 text-amber-400" /> מתוכנן</span>
              <span className="font-bold text-amber-400">{woPlanned}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex gap-2">
            <button onClick={() => navigate("/work-orders")} className="text-xs text-orange-400 hover:underline">הוראות עבודה →</button>
            <button onClick={() => navigate("/raw-materials")} className="text-xs text-orange-400 hover:underline">חומרי גלם →</button>
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold">כספים</h2>
            </div>
            <button onClick={() => navigate("/finance/expenses")}
              className="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-1">
              <Plus className="w-3 h-3" /> הוצאה חדשה
            </button>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="text-xs text-muted-foreground">סה״כ מכירות</div>
              <div className="text-xl font-bold text-emerald-400">₪{totalSalesValue.toLocaleString("he-IL")}</div>
            </div>
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
              <div className="text-xs text-muted-foreground">סה״כ הוצאות ({expenses.length} רשומות)</div>
              <div className="text-xl font-bold text-rose-400">₪{totalExpensesValue.toLocaleString("he-IL")}</div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">פקודות יומן</span>
              <span className="font-bold">{journalEntries.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">חשבונות במפת חשבונות</span>
              <span className="font-bold">{chartOfAccounts.length}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex gap-2 flex-wrap">
            <button onClick={() => navigate("/finance/expenses")} className="text-xs text-emerald-400 hover:underline">הוצאות →</button>
            <button onClick={() => navigate("/finance/journal-entries")} className="text-xs text-emerald-400 hover:underline">פקודות יומן →</button>
            <button onClick={() => navigate("/accounting")} className="text-xs text-emerald-400 hover:underline">הנהלת חשבונות →</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold">עובדים לפי מחלקה</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">סה״כ {employees.length}</span>
              <button onClick={() => navigate("/hr/employees")}
                className="text-xs bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1">
                <Plus className="w-3 h-3" /> עובד חדש
              </button>
            </div>
          </div>
          {departments.length > 0 ? (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {departments.map((dept, i) => {
                const pct = employees.length > 0 ? Math.round((dept.count / employees.length) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-28 text-right shrink-0 truncate">{dept.name}</span>
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-blue-500 to-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono w-16 text-left shrink-0 text-muted-foreground">
                      {dept.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>טוען נתוני עובדים...</p>
            </div>
          )}
        </div>

        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold">ספקים עיקריים</h2>
            </div>
            <button onClick={() => navigate("/suppliers")}
              className="text-xs bg-cyan-500/20 text-cyan-400 px-2.5 py-1 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1">
              <Plus className="w-3 h-3" /> ספק חדש
            </button>
          </div>
          {suppliers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
              {suppliers.slice(0, 12).map((sup: any, i: number) => (
                <button key={i}
                  onClick={() => navigate("/suppliers")}
                  className="rounded-lg border border-border/50 bg-background/50 p-2.5 text-right hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="font-semibold text-sm">{sup.supplierName || sup.supplier_name || sup.name || "ספק"}</div>
                  {(sup.contactPerson || sup.contact_person) && (
                    <div className="text-xs text-muted-foreground">{sup.contactPerson || sup.contact_person}</div>
                  )}
                  {(sup.category || sup.supply_type) && (
                    <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block bg-cyan-500/10 text-cyan-400">
                      {sup.category || sup.supply_type}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>טוען נתוני ספקים...</p>
            </div>
          )}
        </div>
      </div>

      {salesOrders.length > 0 && (
        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold">הזמנות מכירה אחרונות</h2>
            </div>
            <button onClick={() => navigate("/sales/orders")} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
              הצג הכל <ChevronLeft className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-right py-2 px-2">מס׳ הזמנה</th>
                  <th className="text-right py-2 px-2">לקוח</th>
                  <th className="text-right py-2 px-2">סכום</th>
                  <th className="text-right py-2 px-2">סטטוס</th>
                  <th className="text-right py-2 px-2">תאריך</th>
                </tr>
              </thead>
              <tbody>
                {salesOrders.slice(0, 8).map((order: any, i: number) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => navigate("/sales/orders")}>
                    <td className="py-2 px-2 font-mono text-blue-400">{order.order_number}</td>
                    <td className="py-2 px-2">{order.customer_name}</td>
                    <td className="py-2 px-2 font-bold">₪{Number(order.total || 0).toLocaleString("he-IL")}</td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        order.status === "completed" || order.status === "הושלם" ? "bg-emerald-500/20 text-emerald-400" :
                        order.status === "in_progress" || order.status === "בביצוע" ? "bg-blue-500/20 text-blue-400" :
                        "bg-amber-500/20 text-amber-400"
                      }`}>
                        {order.status === "completed" ? "הושלם" : order.status === "in_progress" ? "בביצוע" :
                         order.status === "draft" ? "טיוטה" : order.status || "חדש"}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-muted-foreground text-xs">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString("he-IL") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {workOrders.length > 0 && (
        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-bold">הוראות עבודה / ייצור</h2>
            </div>
            <button onClick={() => navigate("/work-orders")} className="text-xs text-orange-400 hover:underline flex items-center gap-1">
              הצג הכל <ChevronLeft className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-right py-2 px-2">מס׳ הוראה</th>
                  <th className="text-right py-2 px-2">תיאור</th>
                  <th className="text-right py-2 px-2">מחלקה</th>
                  <th className="text-right py-2 px-2">עדיפות</th>
                  <th className="text-right py-2 px-2">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.slice(0, 8).map((wo: any, i: number) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => navigate("/work-orders")}>
                    <td className="py-2 px-2 font-mono text-orange-400">{wo.order_number}</td>
                    <td className="py-2 px-2 max-w-[200px] truncate">{wo.title || wo.description}</td>
                    <td className="py-2 px-2 text-xs">{wo.department || "-"}</td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        wo.priority === "urgent" || wo.priority === "דחוף" ? "bg-red-500/20 text-red-400" :
                        wo.priority === "high" || wo.priority === "גבוה" ? "bg-orange-500/20 text-orange-400" :
                        "bg-muted/20 text-muted-foreground"
                      }`}>
                        {wo.priority === "urgent" ? "דחוף" : wo.priority === "high" ? "גבוה" :
                         wo.priority === "normal" ? "רגיל" : wo.priority === "low" ? "נמוך" : wo.priority || "רגיל"}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        wo.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                        wo.status === "in_progress" ? "bg-blue-500/20 text-blue-400" :
                        wo.status === "planned" ? "bg-amber-500/20 text-amber-400" :
                        "bg-muted/20 text-muted-foreground"
                      }`}>
                        {wo.status === "completed" ? "הושלם" : wo.status === "in_progress" ? "בביצוע" :
                         wo.status === "planned" ? "מתוכנן" : wo.status || "חדש"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-bold">מודולים פעילים במערכת</h2>
          <span className="text-sm text-muted-foreground mr-auto">{modules.length} מודולים</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {modules.map((mod: any) => {
            const route = moduleRouteMap[mod.slug] || `/${mod.slug}`;
            return (
              <button key={mod.id}
                onClick={() => navigate(route)}
                className="rounded-xl border border-border/50 bg-background/50 p-3 text-center hover:bg-accent hover:border-blue-500/30 transition-all cursor-pointer"
              >
                <div className="font-semibold text-sm">{mod.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{mod.slug}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-gradient-to-l from-blue-500/5 to-purple-500/5 border border-blue-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold">הוספה ידנית מהירה</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "עובד חדש", icon: <Users className="w-4 h-4" />, href: "/hr/employees", color: "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" },
            { label: "לקוח חדש", icon: <Building2 className="w-4 h-4" />, href: "/sales/customers", color: "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" },
            { label: "ספק חדש", icon: <Truck className="w-4 h-4" />, href: "/suppliers", color: "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30" },
            { label: "הזמנת מכירה", icon: <ShoppingCart className="w-4 h-4" />, href: "/sales/orders", color: "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30" },
            { label: "הוראת עבודה", icon: <Factory className="w-4 h-4" />, href: "/work-orders", color: "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30" },
            { label: "הוצאה חדשה", icon: <Wallet className="w-4 h-4" />, href: "/finance/expenses", color: "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" },
          ].map((item, i) => (
            <button key={i}
              onClick={() => navigate(item.href)}
              className={`rounded-xl border p-3 flex flex-col items-center gap-2 transition-all cursor-pointer ${item.color}`}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold">סיכום כללי</h2>
        </div>
        <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>המערכת מנהלת <span className="text-foreground font-bold">{modules.length}</span> מודולים עם <span className="text-foreground font-bold">{entities.length}</span> ישויות נתונים.</p>
          <p>צוות החברה מונה <span className="text-foreground font-bold">{employees.length}</span> עובדים ב-<span className="text-foreground font-bold">{departments.length}</span> מחלקות.</p>
          <p>רשומים <span className="text-foreground font-bold">{suppliers.length}</span> ספקים ו-<span className="text-foreground font-bold">{customers.length}</span> לקוחות.</p>
          <p>קטלוג המוצרים כולל <span className="text-foreground font-bold">{products.length}</span> מוצרים ו-<span className="text-foreground font-bold">{rawMaterials.length}</span> חומרי גלם.</p>
          <p>
            נוצרו <span className="text-foreground font-bold">{salesOrders.length}</span> הזמנות מכירה בערך כולל של{" "}
            <span className="text-emerald-400 font-bold">₪{totalSalesValue.toLocaleString("he-IL")}</span>{" "}
            ו-<span className="text-foreground font-bold">{workOrders.length}</span> הוראות עבודה.
          </p>
          <p>
            במערכת <span className="text-foreground font-bold">{chartOfAccounts.length}</span> חשבונות, <span className="text-foreground font-bold">{journalEntries.length}</span> פקודות יומן
            ו-<span className="text-foreground font-bold">{expenses.length}</span> רשומות הוצאה.
          </p>
        </div>
      </div>

      <RelatedRecords tabs={[
        { key: "orders", label: "הזמנות אחרונות", endpoint: "/api/sales/orders?limit=10", columns: [{ key: "order_number", label: "מספר" }, { key: "customer_name", label: "לקוח" }, { key: "status", label: "סטטוס" }] },
        { key: "employees", label: "עובדים", endpoint: "/api/hr/employees?limit=10", columns: [{ key: "first_name", label: "שם" }, { key: "department", label: "מחלקה" }] },
      ]} />

      <ActivityLog entityType="company-report" compact />

    </div>
  );
}
