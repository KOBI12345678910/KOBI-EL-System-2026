import { useState, useEffect } from "react";
import {
  Factory, AlertTriangle, Package, Bell, TrendingUp, Users, Target, BarChart3,
  Clock, CheckCircle2, ShoppingCart, Activity, Zap, DollarSign
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { translateStatus } from "@/lib/status-labels";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar
} from "recharts";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const TABS = ["ייצור", "שרשרת אספקה", "צוות", "לקוחות", "אנליטיקה"];
const API = "/api";

interface WorkOrder {
  id: number | string;
  orderNumber?: string;
  order_number?: string;
  customerName?: string;
  customer_name?: string;
  productName?: string;
  product_name?: string;
  product?: string;
  dueDate?: string;
  due_date?: string;
  status: string;
}

interface Employee {
  id: number | string;
  name?: string;
  fullName?: string;
  full_name?: string;
  role?: string;
  title?: string;
  department?: string;
}

interface Customer {
  id: number | string;
  name?: string;
  companyName?: string;
  company_name?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface PurchaseOrder {
  id: number | string;
  orderNumber?: string;
  order_number?: string;
  supplierName?: string;
  supplier_name?: string;
  supplier?: string;
  totalAmount?: string | number;
  total_amount?: string | number;
  amount?: string | number;
  orderDate?: string;
  order_date?: string;
  status: string;
}

interface RawMaterial {
  id: number | string;
  materialName?: string;
  material_name?: string;
  name?: string;
  currentStock?: string | number;
  current_stock?: string | number;
  reorderPoint?: string | number;
  reorder_point?: string | number;
  unit?: string;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Package size={40} className="mx-auto mb-3 opacity-30" />
      <p>{message}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const relatedTabs = [
  {
    key: "work-orders", label: "הזמנות עבודה", endpoint: `${API}/work-orders?limit=10`,
    columns: [
      { key: "order_number", label: "מספר הזמנה" },
      { key: "product_name", label: "מוצר" },
      { key: "customer_name", label: "לקוח" },
      { key: "status", label: "סטטוס" },
    ],
  },
  {
    key: "purchase-orders", label: "הזמנות רכש", endpoint: `${API}/purchase-orders?limit=10`,
    columns: [
      { key: "order_number", label: "מספר הזמנה" },
      { key: "supplier_name", label: "ספק" },
      { key: "total_amount", label: "סכום" },
      { key: "status", label: "סטטוס" },
    ],
  },
  {
    key: "raw-materials", label: "חומרי גלם", endpoint: `${API}/raw-materials?limit=10`,
    columns: [
      { key: "material_name", label: "שם חומר" },
      { key: "current_stock", label: "מלאי נוכחי" },
      { key: "reorder_point", label: "נקודת הזמנה" },
      { key: "unit", label: "יחידה" },
    ],
  },
];

export default function ProductionDashboardPage() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [productionOrders, setProductionOrders] = useState<WorkOrder[]>([]);
  const [teamMembers, setTeamMembers] = useState<Employee[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [workOrders, setWorkOrders] = useState<Record<string, number>>({});
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const safeJson = async (res: Response) => { if (!res.ok) throw new Error(`${res.status}`); return res.json(); };
        const [woRes, alertsRes, teamRes, custRes, poRes, rmRes] = await Promise.allSettled([
          authFetch(`${API}/work-orders?limit=20`, { headers }).then(safeJson),
          authFetch(`${API}/work-orders/stats`, { headers }).then(safeJson),
          authFetch(`${API}/hr/employees?limit=20`, { headers }).then(safeJson),
          authFetch(`${API}/sales/customers?limit=10`, { headers }).then(safeJson),
          authFetch(`${API}/purchase-orders?limit=10`, { headers }).then(safeJson),
          authFetch(`${API}/raw-materials?limit=20`, { headers }).then(safeJson),
        ]);

        if (woRes.status === "fulfilled") {
          const d = woRes.value;
          const orders = Array.isArray(d) ? d : (d?.data || d?.items || []);
          setProductionOrders(orders);
        }
        if (alertsRes.status === "fulfilled") {
          setWorkOrders(alertsRes.value || {});
        }
        if (teamRes.status === "fulfilled") {
          const d = teamRes.value;
          setTeamMembers(Array.isArray(d) ? d : (d?.data || d?.items || []));
        }
        if (custRes.status === "fulfilled") {
          const d = custRes.value;
          setCustomers(Array.isArray(d) ? d : (d?.data || d?.items || []));
        }
        if (poRes.status === "fulfilled") {
          const d = poRes.value;
          setPurchaseOrders(Array.isArray(d) ? d : (d?.data || d?.items || []));
        }
        if (rmRes.status === "fulfilled") {
          const d = rmRes.value;
          const materials = Array.isArray(d) ? d : (d?.data || d?.items || []);
          setRawMaterials(materials.filter((m) => {
            const level = parseFloat(m.currentStock || m.current_stock || "0");
            const min = parseFloat(m.reorderPoint || m.reorder_point || "0");
            return min > 0 && level <= min;
          }));
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const overdueCritical = productionOrders.filter((o) => o.status === "באיחור" || o.status === "overdue");

  const pieData = [
    { name: "בביצוע", value: productionOrders.filter((o) => o.status === "בביצוע" || o.status === "in_progress").length, color: "#3b82f6" },
    { name: "הושלם", value: productionOrders.filter((o) => o.status === "הושלם" || o.status === "completed").length, color: "#22c55e" },
    { name: "בתכנון", value: productionOrders.filter((o) => o.status === "בתכנון" || o.status === "planned").length, color: "#f59e0b" },
    { name: "באיחור", value: overdueCritical.length, color: "#ef4444" },
  ].filter(d => d.value > 0);

  const completionRate = productionOrders.length > 0
    ? Math.round((productionOrders.filter((o) => o.status === "הושלם" || o.status === "completed").length / productionOrders.length) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <Factory className="text-blue-600" size={32} />
            מחלקת ייצור ושרשרת אספקה
          </h1>
          <p className="text-muted-foreground mt-1">ניהול ייצור מתקדם עם ניטור בזמן אמת</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          מערכת פעילה
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <div className="text-xs text-muted-foreground">אחוז השלמות</div>
          <div className="text-xl sm:text-3xl font-bold text-blue-600">{completionRate}%</div>
          <div className="text-xs text-muted-foreground">↑ מגמת ביצוע</div>
        </div>
        <div className="bg-card border rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <div className="text-xs text-muted-foreground">התראות קריטיות</div>
          <div className="text-xl sm:text-3xl font-bold text-orange-500">{overdueCritical.length}</div>
          <div className="text-xs text-muted-foreground">דרוש טיפול</div>
        </div>
        <div className="bg-card border rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <div className="text-xs text-muted-foreground">חומרי גלם חסרים</div>
          <div className="text-xl sm:text-3xl font-bold text-amber-500">{rawMaterials.length}</div>
          <div className="text-xs text-muted-foreground">פריטים במלאי נמוך</div>
        </div>
        <div className="bg-blue-600 text-foreground rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <div className="text-xs text-blue-200">הזמנות בייצור</div>
          <div className="text-4xl font-bold">{productionOrders.length}</div>
          <div className="text-xs text-blue-200">
            {productionOrders.filter((o) => o.status === "הושלם" || o.status === "completed").length} הושלמו
          </div>
        </div>
      </div>

      {overdueCritical.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4 font-semibold text-orange-700">
            <Bell size={18} />
            הזמנות באיחור ({overdueCritical.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdueCritical.slice(0, 6).map((a) => (
              <div key={a.id} className="bg-card border border-orange-200 rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-orange-500" />
                  <span className="font-medium text-sm text-foreground">
                    {a.orderNumber || a.order_number || `הזמנה #${a.id}`}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  {a.customerName || a.customer_name || ""}
                  {a.dueDate || a.due_date ? ` | תאריך יעד: ${new Date(a.dueDate || a.due_date).toLocaleDateString("he-IL")}` : ""}
                </div>
                <div className="text-xs font-bold text-red-500">סטטוס: {translateStatus(a.status)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex border-b gap-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`pb-2 px-1 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === i ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {tab === 0 && (
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card border rounded-xl p-4 shadow-sm">
                  <div className="font-semibold mb-4 flex items-center gap-2 text-foreground">
                    <BarChart3 size={18} />
                    סטטוס ייצור
                  </div>
                  {pieData.length === 0 ? (
                    <EmptyState message="אין הזמנות ייצור פעילות" />
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                          {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="bg-card border rounded-xl p-4 shadow-sm">
                  <div className="font-semibold mb-4 flex items-center gap-2 text-foreground">
                    <TrendingUp size={18} />
                    סטטיסטיקות הזמנות
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: "סה״כ הזמנות", value: productionOrders.length, color: "text-blue-600" },
                      { label: "הושלמו", value: productionOrders.filter((o) => o.status === "הושלם" || o.status === "completed").length, color: "text-green-600" },
                      { label: "בביצוע", value: productionOrders.filter((o) => o.status === "בביצוע" || o.status === "in_progress").length, color: "text-blue-500" },
                      { label: "באיחור", value: overdueCritical.length, color: "text-red-600" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="text-sm text-muted-foreground">{item.label}</span>
                        <span className={`text-xl font-bold ${item.color}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between">
                  <span className="font-semibold text-foreground">הזמנות בייצור ({productionOrders.length})</span>
                </div>
                {productionOrders.length === 0 ? (
                  <EmptyState message="אין הזמנות ייצור" />
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="p-3 text-right text-muted-foreground">מס' הזמנה</th>
                          <th className="p-3 text-right text-muted-foreground">לקוח</th>
                          <th className="p-3 text-right text-muted-foreground">מוצר</th>
                          <th className="p-3 text-right text-muted-foreground">תאריך יעד</th>
                          <th className="p-3 text-right text-muted-foreground">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productionOrders.map((r) => (
                          <tr key={r.id} className="border-t hover:bg-muted/30">
                            <td className="p-3 font-mono text-xs text-muted-foreground">{r.orderNumber || r.order_number || `#${r.id}`}</td>
                            <td className="p-3 font-medium">{r.customerName || r.customer_name || "—"}</td>
                            <td className="p-3 text-muted-foreground">{r.productName || r.product_name || r.product || "—"}</td>
                            <td className="p-3 text-muted-foreground">{r.dueDate || r.due_date ? new Date(r.dueDate || r.due_date).toLocaleDateString("he-IL") : "—"}</td>
                            <td className="p-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                (r.status === "הושלם" || r.status === "completed") ? "bg-green-100 text-green-700" :
                                (r.status === "באיחור" || r.status === "overdue") ? "bg-red-100 text-red-700" :
                                "bg-blue-100 text-blue-700"
                              }`}>{translateStatus(r.status)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 1 && (
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border rounded-xl p-4 shadow-sm text-center">
                  <ShoppingCart className="mx-auto mb-2 text-blue-500" size={24} />
                  <div className="text-lg sm:text-2xl font-bold">{purchaseOrders.filter((o) => o.status === "ממתין" || o.status === "pending").length}</div>
                  <div className="text-xs text-muted-foreground">הזמנות רכש ממתינות</div>
                </div>
                <div className="bg-card border rounded-xl p-4 shadow-sm text-center">
                  <AlertTriangle className="mx-auto mb-2 text-amber-500" size={24} />
                  <div className="text-lg sm:text-2xl font-bold">{rawMaterials.length}</div>
                  <div className="text-xs text-muted-foreground">חומרי גלם במלאי נמוך</div>
                </div>
                <div className="bg-card border rounded-xl p-4 shadow-sm text-center">
                  <Package className="mx-auto mb-2 text-red-500" size={24} />
                  <div className="text-lg sm:text-2xl font-bold">{purchaseOrders.length}</div>
                  <div className="text-xs text-muted-foreground">סה״כ הזמנות רכש</div>
                </div>
              </div>
              <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b font-semibold text-foreground">הזמנות רכש פעילות</div>
                {purchaseOrders.length === 0 ? (
                  <EmptyState message="אין הזמנות רכש" />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="p-3 text-right">מס' הזמנה</th>
                        <th className="p-3 text-right">ספק</th>
                        <th className="p-3 text-right">סכום</th>
                        <th className="p-3 text-right">תאריך</th>
                        <th className="p-3 text-right">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.map((r) => (
                        <tr key={r.id} className="border-t hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">{r.orderNumber || r.order_number || `#${r.id}`}</td>
                          <td className="p-3 font-medium">{r.supplierName || r.supplier_name || r.supplier || "—"}</td>
                          <td className="p-3 font-medium text-green-600">₪{parseFloat(r.totalAmount || r.total_amount || r.amount || "0").toLocaleString("he-IL")}</td>
                          <td className="p-3">{r.orderDate || r.order_date ? new Date(r.orderDate || r.order_date).toLocaleDateString("he-IL") : "—"}</td>
                          <td className="p-3"><span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{translateStatus(r.status)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="bg-card border rounded-xl shadow-sm">
                <div className="p-4 border-b font-semibold text-foreground flex items-center gap-2">
                  <Package size={18} className="text-amber-500" />
                  חומרי גלם במלאי נמוך
                </div>
                {rawMaterials.length === 0 ? (
                  <div className="p-3 sm:p-6"><EmptyState message="כל חומרי הגלם במלאי מספק" /></div>
                ) : (
                  <div className="p-4 space-y-3">
                    {rawMaterials.map((m) => {
                      const level = parseFloat(m.currentStock || m.current_stock || "0");
                      const min = parseFloat(m.reorderPoint || m.reorder_point || "0");
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="text-sm font-medium">{m.materialName || m.material_name || m.name}</div>
                            <div className="text-xs text-muted-foreground">{level} {m.unit} (מינימום: {min} {m.unit})</div>
                            <div className="mt-1 bg-muted rounded-full h-1.5">
                              <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, min > 0 ? (level / min) * 100 : 0)}%` }} />
                            </div>
                          </div>
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">נמוך</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 2 && (
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "עובדים", value: teamMembers.length, icon: Users, color: "text-blue-500" },
                  { label: "הזמנות פעילות", value: productionOrders.filter((o) => o.status === "בביצוע" || o.status === "in_progress").length, icon: Activity, color: "text-green-500" },
                  { label: "הושלמו", value: productionOrders.filter((o) => o.status === "הושלם" || o.status === "completed").length, icon: CheckCircle2, color: "text-emerald-500" },
                  { label: "יעד השלמה", value: `${completionRate}%`, icon: Target, color: "text-purple-500" },
                ].map((k) => (
                  <div key={k.label} className="bg-card border rounded-xl p-4 shadow-sm text-center">
                    <k.icon className={`mx-auto mb-2 ${k.color}`} size={24} />
                    <div className="text-lg sm:text-2xl font-bold">{k.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-3">עובדים ({teamMembers.length})</h3>
                {teamMembers.length === 0 ? (
                  <EmptyState message="אין עובדים רשומים" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {teamMembers.slice(0, 12).map((m) => (
                      <div key={m.id} className="bg-card border rounded-xl p-4 shadow-sm flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                          {(m.name || m.fullName || m.full_name || "?")[0]}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{m.name || m.fullName || m.full_name}</div>
                          <div className="text-xs text-muted-foreground">{m.role || m.title || m.department}</div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-600">פעיל</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 3 && (
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "לקוחות פעילים", value: customers.length, icon: Users, color: "text-blue-500" },
                  { label: "הזמנות פתוחות", value: productionOrders.filter((o) => o.status !== "הושלם" && o.status !== "completed").length, icon: ShoppingCart, color: "text-emerald-500" },
                  { label: "הזמנות שהושלמו", value: productionOrders.filter((o) => o.status === "הושלם" || o.status === "completed").length, icon: DollarSign, color: "text-green-500" },
                ].map((k) => (
                  <div key={k.label} className="bg-card border rounded-xl p-4 shadow-sm text-center">
                    <k.icon className={`mx-auto mb-2 ${k.color}`} size={24} />
                    <div className="text-lg sm:text-2xl font-bold">{k.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-3">לקוחות ({customers.length})</h3>
                {customers.length === 0 ? (
                  <EmptyState message="אין לקוחות רשומים" />
                ) : (
                  customers.slice(0, 10).map((c) => (
                    <div key={c.id} className="bg-card border rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                          {(c.name || c.companyName || c.company_name || "?")[0]}
                        </div>
                        <div>
                          <div className="font-medium">{c.name || c.companyName || c.company_name}</div>
                          <div className="text-xs text-muted-foreground">{c.city || c.address || ""}</div>
                        </div>
                      </div>
                      {c.phone && <div className="text-sm text-muted-foreground">{c.phone}</div>}
                      {c.email && <div className="text-sm text-muted-foreground">{c.email}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 4 && (
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "סה״כ הזמנות", value: productionOrders.length, icon: Zap, color: "text-blue-500" },
                  { label: "אחוז השלמה", value: `${completionRate}%`, icon: TrendingUp, color: "text-green-500" },
                  { label: "באיחור", value: overdueCritical.length, icon: Clock, color: "text-amber-500" },
                  { label: "חומרים חסרים", value: rawMaterials.length, icon: Activity, color: "text-purple-500" },
                ].map((k) => (
                  <div key={k.label} className="bg-card border rounded-xl p-4 shadow-sm">
                    <k.icon className={`mb-2 ${k.color}`} size={22} />
                    <div className="text-lg sm:text-2xl font-bold">{k.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
                  </div>
                ))}
              </div>
              {pieData.length > 0 && (
                <div className="bg-card border rounded-xl p-4 shadow-sm">
                  <div className="font-semibold mb-4 text-foreground">התפלגות הזמנות לפי סטטוס</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={pieData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" name="הזמנות">
                        {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="space-y-6 mt-8">
        <RelatedRecords tabs={relatedTabs} />
        <ActivityLog entityType="production_dashboard" />
      </div>
    </div>
  );
}
